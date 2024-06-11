import { describe, test, expect, beforeAll, beforeEach } from '@jest/globals';
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing';
import * as algokit from '@algorandfoundation/algokit-utils';
import * as algosdk from 'algosdk';
import { DigitalMarketplaceClient } from '../contracts/clients/DigitalMarketplaceClient';

const fixture = algorandFixture();
algokit.Config.configure({ populateAppCallResources: true });

let appClient: DigitalMarketplaceClient;

describe('DigitalMarketplace', () => {
  beforeEach(fixture.beforeEach);
  let seller: string;
  let testAssetsID: (number | bigint)[];

  beforeAll(async () => {
    await fixture.beforeEach();
    const { testAccount: sellerAccount } = fixture.context;
    const { algorand } = fixture;

    seller = sellerAccount.addr;

    appClient = new DigitalMarketplaceClient(
      {
        sender: sellerAccount,
        resolveBy: 'id',
        id: 0,
      },
      algorand.client.algod
    );

    testAssetsID = await Promise.all(
      [new Uint8Array([0x00]), new Uint8Array([0x001])].map(async (note) => {
        const assetCreate = await algorand.send.assetCreate({
          sender: seller,
          total: 10n,
          note,
        });
        return assetCreate.confirmation.assetIndex!;
      })
    );

    await appClient.create.createApplication({});
    await appClient.appClient.fundAppAccount(algokit.algos(0.1));
  });

  test('allowAsset', async () => {
    const { algorand } = fixture;
    const { appAddress } = await appClient.appClient.getAppReference();

    const mbrTxn = await algorand.transactions.payment({
      sender: seller,
      receiver: appAddress,
      amount: algokit.algos(0.1),
      extraFee: algokit.algos(0.001),
    });

    const results = await Promise.all(
      testAssetsID.map(async (asset) => {
        return appClient.allowAsset({
          mbrPay: mbrTxn,
          asset,
        });
      })
    );

    results.map((result) => expect(result.confirmation).toBeDefined());

    const balances = await Promise.all(
      testAssetsID.map(async (asset) => {
        return (await algorand.account.getAssetInformation(appAddress, asset)).balance;
      })
    );

    balances.map((balance) => expect(balance).toBe(0n));
  });

  test('firstDeposit', async () => {
    const { algorand } = fixture;
    const { appAddress } = await appClient.appClient.getAppReference();

    const mbrTxn = await algorand.transactions.payment({
      sender: seller,
      receiver: appAddress,
      amount: algokit.algos(0.0249),
    });

    const results = await Promise.all(
      testAssetsID.map(async (asset) => {
        return appClient.firstDeposit({
          mbrPay: mbrTxn,
          xfer: await algorand.transactions.assetTransfer({
            assetId: BigInt(asset),
            sender: seller,
            receiver: appAddress,
            amount: 3n,
          }),
          unitaryPrice: algokit.algos(1).microAlgos,
        });
      })
    );

    results.map((result) => expect(result.confirmation).toBeDefined());
    const balances = await Promise.all(
      testAssetsID.map(async (asset) => {
        return (await algorand.account.getAssetInformation(appAddress, asset)).balance;
      })
    );

    balances.map((balance) => expect(balance).toBe(3n));

    await Promise.all(
      testAssetsID.map(async (asset) => {
        const boxContent = await appClient.appClient.getBoxValue(
          new Uint8Array([...algokit.getAccountAddressAsUint8Array(seller), ...algosdk.encodeUint64(asset)])
        );

        const currentDeposited = algosdk.decodeUint64(boxContent.slice(0, 8), 'safe');
        const currentUnitaryPrice = algosdk.decodeUint64(boxContent.slice(8, 16), 'safe');

        expect(currentDeposited).toBe(3);
        expect(currentUnitaryPrice).toBe(1_000_000);
      })
    );
  });

  test('deposit', async () => {
    const { algorand } = fixture;
    const { appAddress } = await appClient.appClient.getAppReference();

    const results = await Promise.all(
      testAssetsID.map(async (asset) => {
        return appClient.deposit({
          xfer: await algorand.transactions.assetTransfer({
            assetId: BigInt(asset),
            sender: seller,
            receiver: appAddress,
            amount: 2n,
          }),
        });
      })
    );

    results.map((result) => expect(result.confirmation).toBeDefined());

    const balances = await Promise.all(
      testAssetsID.map(async (asset) => {
        return (await algorand.account.getAssetInformation(appAddress, asset)).balance;
      })
    );

    balances.map((balance) => expect(balance).toBe(5n));

    await Promise.all(
      testAssetsID.map(async (asset) => {
        const boxContent = await appClient.appClient.getBoxValue(
          new Uint8Array([...algokit.getAccountAddressAsUint8Array(seller), ...algosdk.encodeUint64(asset)])
        );

        const currentDeposited = algosdk.decodeUint64(boxContent.slice(0, 8), 'safe');

        expect(currentDeposited).toBe(5);
      })
    );
  });

  test('setPrice', async () => {
    const results = await Promise.all(
      testAssetsID.map((asset) => {
        return appClient.setPrice({
          asset,
          newPrice: algokit.algos(0.5).microAlgos,
        });
      })
    );

    results.map((result) => expect(result.confirmation).toBeDefined());

    await Promise.all(
      testAssetsID.map(async (asset) => {
        const boxContent = await appClient.appClient.getBoxValue(
          new Uint8Array([...algokit.getAccountAddressAsUint8Array(seller), ...algosdk.encodeUint64(asset)])
        );

        const currentUnitaryPrice = algosdk.decodeUint64(boxContent.slice(8, 16), 'safe');

        expect(currentUnitaryPrice).toBe(500_000);
      })
    );
  });

  test('buy', async () => {
    const { algorand } = fixture;
    const { testAccount: buyerAccount } = fixture.context;

    const quantity = 3;

    const results = await Promise.all(
      testAssetsID.map(async (asset) => {
        // Hacer optin del comprador
        await algorand.send.assetOptIn({
          assetId: BigInt(asset),
          sender: buyerAccount.addr,
        });

        // Traer unitaryPrice del box
        const boxContent = await appClient.appClient.getBoxValue(
          new Uint8Array([...algokit.getAccountAddressAsUint8Array(seller), ...algosdk.encodeUint64(asset)])
        );

        const currentUnitaryPrice = algosdk.decodeUint64(boxContent.slice(8, 16), 'safe');

        return appClient.buy(
          {
            owner: seller,
            asset,
            buyPay: await algorand.transactions.payment({
              sender: buyerAccount.addr,
              receiver: seller,
              amount: algokit.algos((currentUnitaryPrice * quantity) / 1_000_000),
            }),
            quantity,
          },
          {
            sender: buyerAccount,
            sendParams: { fee: algokit.algos(0.002) },
          }
        );
      })
    );

    results.map((result) => expect(result.confirmation).toBeDefined());
  });

  test('withdraw', async () => {
    const { algod } = fixture.context;
    const algosBeforeCall = (await algokit.getAccountInformation(seller, algod)).amount;

    const results = await Promise.all(
      testAssetsID.map(async (asset) => {
        return appClient.withdraw(
          {
            asset,
          },
          {
            sendParams: { fee: algokit.algos(0.003) },
          }
        );
      })
    );

    const algosAfterCall = (await algokit.getAccountInformation(seller, algod)).amount;

    expect(algosAfterCall - algosBeforeCall).toBe((2_500 + 400 * 56) * 2 - 6_000);

    results.map((result) => expect(result).toBeDefined());
  });
});
