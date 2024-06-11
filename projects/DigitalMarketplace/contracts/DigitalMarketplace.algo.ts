import { Contract } from '@algorandfoundation/tealscript';

const forSaleMBR = 2_500 + 400 * 56;

export class DigitalMarketplace extends Contract {
  forSaleBoard = BoxMap<{ owner: Address; asa: uint64 }, { deposited: uint64; unitaryPrice: uint64 }>();

  // Permitir que el contrato reciba assets
  allowAsset(mbrPay: PayTxn, asset: AssetID) {
    assert(!this.app.address.isOptedInToAsset(asset));

    verifyTxn(mbrPay, {
      receiver: this.app.address,
      amount: globals.assetOptInMinBalance,
    });

    sendAssetTransfer({
      xferAsset: asset,
      assetAmount: 0,
      assetReceiver: this.app.address,
    });
  }

  // Metodo para realizar un deposito de assets

  // Metodo de primer deposito

  // Global State -> Almacenamiento relacionado al contrato
  // Local State -> Almacenamiento relacion al usuario
  // Boxes -> Almacenamientos en Algorand ilimtado max 32kb x box, Boxes sin limite por contrato

  // Boxes : Key->Value ----- Key: {owner,assetID}  //  Value: {deposited,unitaryPrice}
  firstDeposit(mbrPay: PayTxn, xfer: AssetTransferTxn, unitaryPrice: uint64) {
    assert(!this.forSaleBoard({ owner: this.txn.sender, asa: xfer.xferAsset.id }).exists);

    // MBR del box es 2_500 + 400 * byte
    // Calculo de bytes = NumBytes(address) + NumBytes(uint64) + NumBytes(uint64) + NumBytes(uint64)
    //  Bytes = 32 + 8 + 8 + 8 = 56 Byte
    // MBR = 2_500 + 400 * 56
    verifyPayTxn(mbrPay, {
      sender: this.txn.sender,
      receiver: this.app.address,
      amount: forSaleMBR,
    });

    verifyAssetTransferTxn(xfer, {
      sender: this.txn.sender,
      assetReceiver: this.app.address,
      assetAmount: { greaterThan: 0 },
    });

    this.forSaleBoard({ owner: this.txn.sender, asa: xfer.xferAsset.id }).value = {
      deposited: xfer.assetAmount,
      unitaryPrice: unitaryPrice,
    };
  }

  // Metodo de depositos posteriores
  deposit(xfer: AssetTransferTxn) {
    assert(this.forSaleBoard({ owner: this.txn.sender, asa: xfer.xferAsset.id }).exists);

    verifyAssetTransferTxn(xfer, {
      sender: this.txn.sender,
      assetReceiver: this.app.address,
      assetAmount: { greaterThan: 0 },
    });

    const currentBalance = this.forSaleBoard({ owner: this.txn.sender, asa: xfer.xferAsset.id }).value.deposited;
    const currentPrice = this.forSaleBoard({ owner: this.txn.sender, asa: xfer.xferAsset.id }).value.unitaryPrice;

    this.forSaleBoard({ owner: this.txn.sender, asa: xfer.xferAsset.id }).value = {
      deposited: currentBalance + xfer.assetAmount,
      unitaryPrice: currentPrice,
    };
  }

  // Metodo para modificar el precio de los assets a venderse
  setPrice(asset: uint64, newPrice: uint64) {
    assert(this.forSaleBoard({ owner: this.txn.sender, asa: asset }).exists);

    const currentDeposit = this.forSaleBoard({ owner: this.txn.sender, asa: asset }).value.deposited;

    this.forSaleBoard({ owner: this.txn.sender, asa: asset }).value = {
      deposited: currentDeposit,
      unitaryPrice: newPrice,
    };
  }

  // Metodo para hacer la compra de los assets por parte del usuario
  buy(owner: Address, asset: AssetID, buyPay: PayTxn, quantity: uint64) {
    const currentPrice = this.forSaleBoard({ owner: owner, asa: asset.id }).value.unitaryPrice;
    const currentDeposit = this.forSaleBoard({ owner: owner, asa: asset.id }).value.deposited;
    const amountToBePaid = currentPrice * quantity;

    verifyPayTxn(buyPay, {
      sender: this.txn.sender,
      receiver: owner,
      amount: amountToBePaid,
    });

    sendAssetTransfer({
      xferAsset: asset,
      assetReceiver: this.txn.sender,
      assetAmount: quantity,
    });

    this.forSaleBoard({ owner: owner, asa: asset.id }).value = {
      deposited: currentDeposit - quantity,
      unitaryPrice: currentPrice,
    };
  }

  // Metodo para que el comprador retire sus ganancias y assets restantes
  withdraw(asset: AssetID) {
    const currentDeposit = this.forSaleBoard({ owner: this.txn.sender, asa: asset.id }).value.deposited;
    this.forSaleBoard({ owner: this.txn.sender, asa: asset.id }).delete();

    sendAssetTransfer({
      xferAsset: asset,
      assetReceiver: this.txn.sender,
      assetAmount: currentDeposit,
    });

    sendPayment({
      receiver: this.txn.sender,
      amount: forSaleMBR,
    });
  }
}
