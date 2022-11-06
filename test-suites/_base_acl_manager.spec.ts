import {expect} from "chai";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {constants, utils, Wallet} from "ethers";
import {ZERO_ADDRESS} from "../deploy/helpers/constants";
import {ProtocolErrors} from "../deploy/helpers/types";
import {ACLManager, ACLManager__factory} from "../types";
import {TestEnv} from "./helpers/make-suite";
import {testEnvFixture} from "./helpers/setup-env";
import {evmRevert, evmSnapshot} from "../deploy/helpers/misc-utils";

describe("Access Control List Manager", () => {
  let aclManager: ACLManager;
  let testEnv: TestEnv;

  const FLASH_BORROW_ADMIN_ROLE = utils.keccak256(
    utils.formatBytes32String("FLASH_BORROWER_ADMIN")
  );

  let mySnapshot;
  before(async () => {
    testEnv = await loadFixture(testEnvFixture);
    const {deployer, addressesProvider} = testEnv;
    aclManager = await new ACLManager__factory(deployer.signer).deploy(
      addressesProvider.address
    );
  });
  beforeEach(async () => {
    // before every case running, save the snapshot in order to easily recover environment to a initial state in afterEach
    mySnapshot = await evmSnapshot();
  });
  afterEach(async () => {
    // recover the env to a initial state
    await evmRevert(mySnapshot);
  });

  // initialize all the ADMINS(including bridge)
  const setUpAllRoles = async (t: TestEnv) => {
    const {
      deployer,
      users: [
        poolAdmin,
        flashBorrowAdmin,
        flashBorrower,
        emergencyAdmin,
        riskAdmin,
        bridge,
        assetListingAdmin,
      ],
    } = t;
    // set up 7 roles
    const FLASH_BORROW_ROLE = await aclManager.FLASH_BORROWER_ROLE();
    await aclManager
      .connect(deployer.signer)
      .grantRole(FLASH_BORROW_ADMIN_ROLE, flashBorrowAdmin.address);
    await aclManager
      .connect(deployer.signer)
      .setRoleAdmin(FLASH_BORROW_ROLE, FLASH_BORROW_ADMIN_ROLE);

    await aclManager
      .connect(flashBorrowAdmin.signer)
      .addFlashBorrower(flashBorrower.address);
    await aclManager.connect(deployer.signer).addPoolAdmin(poolAdmin.address);
    await aclManager
      .connect(deployer.signer)
      .addEmergencyAdmin(emergencyAdmin.address);
    await aclManager.connect(deployer.signer).addRiskAdmin(riskAdmin.address);

    await aclManager.connect(deployer.signer).addBridge(bridge.address);
    await aclManager
      .connect(deployer.signer)
      .addAssetListingAdmin(assetListingAdmin.address);
  };

  it("TC-ACLManager-01 Check deployer is just DEFAULT_ADMIN_ROLE after deployed", async () => {
    const {deployer} = testEnv;
    const DEFAULT_ADMIN_ROLE = await aclManager.DEFAULT_ADMIN_ROLE();

    expect(
      await aclManager.hasRole(DEFAULT_ADMIN_ROLE, deployer.address)
    ).to.be.eq(true);
    // check deployer is none of the other roles
    expect(await aclManager.isEmergencyAdmin(deployer.address)).to.be.eq(false);
    expect(await aclManager.isBridge(deployer.address)).to.be.eq(false);
    expect(await aclManager.isFlashBorrower(deployer.address)).to.be.eq(false);
    expect(await aclManager.isPoolAdmin(deployer.address)).to.be.eq(false);
    expect(await aclManager.isRiskAdmin(deployer.address)).to.be.eq(false);
    expect(await aclManager.isAssetListingAdmin(deployer.address)).to.be.eq(
      false
    );
  });

  it("TC-ACLManager-02 Check common users are none of ADMINS or roles", async () => {
    const {users} = testEnv;
    const DEFAULT_ADMIN_ROLE = await aclManager.DEFAULT_ADMIN_ROLE();

    for (const user of users) {
      expect(
        await aclManager.hasRole(DEFAULT_ADMIN_ROLE, user.address)
      ).to.be.eq(false);
      expect(await aclManager.isEmergencyAdmin(user.address)).to.be.eq(false);
      expect(await aclManager.isBridge(user.address)).to.be.eq(false);
      expect(await aclManager.isFlashBorrower(user.address)).to.be.eq(false);
      expect(await aclManager.isPoolAdmin(user.address)).to.be.eq(false);
      expect(await aclManager.isRiskAdmin(user.address)).to.be.eq(false);
      expect(await aclManager.isAssetListingAdmin(user.address)).to.be.eq(
        false
      );
    }
  });

  describe("TC-ACLManager-03 deployer Grant and Revoke FLASH_BORROW_ADMIN role", () => {
    it("grant", async () => {
      const {
        deployer,
        users: [flashBorrowAdmin],
      } = testEnv;
      expect(
        await aclManager.hasRole(
          FLASH_BORROW_ADMIN_ROLE,
          flashBorrowAdmin.address
        )
      ).to.be.eq(false);
      await aclManager
        .connect(deployer.signer)
        .grantRole(FLASH_BORROW_ADMIN_ROLE, flashBorrowAdmin.address);
      expect(
        await aclManager.hasRole(
          FLASH_BORROW_ADMIN_ROLE,
          flashBorrowAdmin.address
        )
      ).to.be.eq(true);
    });
    it("revoke", async () => {
      const {
        deployer,
        users: [flashBorrowAdmin],
      } = testEnv;
      await aclManager
        .connect(deployer.signer)
        .revokeRole(FLASH_BORROW_ADMIN_ROLE, flashBorrowAdmin.address);
      expect(
        await aclManager.hasRole(
          FLASH_BORROW_ADMIN_ROLE,
          flashBorrowAdmin.address
        )
      ).to.be.eq(false);
    });
  });

  it("TC-ACLManager-04 deployer Add and Remove POOL_ADMIN", async () => {
    const {
      deployer,
      users: [, poolAdmin],
    } = testEnv;

    expect(await aclManager.isPoolAdmin(poolAdmin.address)).to.be.eq(false);

    await aclManager.connect(deployer.signer).addPoolAdmin(poolAdmin.address);
    expect(await aclManager.isPoolAdmin(poolAdmin.address)).to.be.eq(true);

    await aclManager
      .connect(deployer.signer)
      .removePoolAdmin(poolAdmin.address);
    expect(await aclManager.isPoolAdmin(poolAdmin.address)).to.be.eq(false);
  });

  it("TC-ACLManager-05 deployer Add multiple POOL_ADMINS", async () => {
    const {
      deployer,
      users: [poolAdmin1, poolAdmin2],
    } = testEnv;
    await aclManager.connect(deployer.signer).addPoolAdmin(poolAdmin1.address);
    await aclManager.connect(deployer.signer).addPoolAdmin(poolAdmin2.address);
    expect(await aclManager.isPoolAdmin(poolAdmin1.address)).to.be.eq(true);
    expect(await aclManager.isPoolAdmin(poolAdmin2.address)).to.be.eq(true);
  });

  it("TC-ACLManager-06 deployer Add and Remove EMERGENCY_ADMIN", async () => {
    const {
      deployer,
      users: [, , emergencyAdmin],
    } = testEnv;

    expect(await aclManager.isEmergencyAdmin(emergencyAdmin.address)).to.be.eq(
      false
    );
    await aclManager
      .connect(deployer.signer)
      .addEmergencyAdmin(emergencyAdmin.address);
    expect(await aclManager.isEmergencyAdmin(emergencyAdmin.address)).to.be.eq(
      true
    );

    await aclManager
      .connect(deployer.signer)
      .removeEmergencyAdmin(emergencyAdmin.address);
    expect(await aclManager.isEmergencyAdmin(emergencyAdmin.address)).to.be.eq(
      false
    );
  });

  it("TC-ACLManager-07 deployer Add multiple EMERGENCY_ADMINS", async () => {
    const {
      deployer,
      users: [emergencyAdmin1, emergencyAdmin2],
    } = testEnv;

    await aclManager
      .connect(deployer.signer)
      .addEmergencyAdmin(emergencyAdmin1.address);
    await aclManager
      .connect(deployer.signer)
      .addEmergencyAdmin(emergencyAdmin2.address);
    expect(await aclManager.isEmergencyAdmin(emergencyAdmin1.address)).to.be.eq(
      true
    );
    expect(await aclManager.isEmergencyAdmin(emergencyAdmin2.address)).to.be.eq(
      true
    );
  });

  it("TC-ACLManager-08 deployer Add and Remove BRIDGE", async () => {
    const {
      deployer,
      users: [, , , bridge],
    } = testEnv;

    expect(await aclManager.isBridge(bridge.address)).to.be.eq(false);
    await aclManager.connect(deployer.signer).addBridge(bridge.address);
    expect(await aclManager.isBridge(bridge.address)).to.be.eq(true);

    await aclManager.connect(deployer.signer).removeBridge(bridge.address);
    expect(await aclManager.isBridge(bridge.address)).to.be.eq(false);
  });

  it("TC-ACLManager-09 deployer Add multiple BRIDGEs", async () => {
    const {
      deployer,
      users: [bridge1, bridge2],
    } = testEnv;

    await aclManager.connect(deployer.signer).addBridge(bridge1.address);
    await aclManager.connect(deployer.signer).addBridge(bridge2.address);
    expect(await aclManager.isBridge(bridge1.address)).to.be.eq(true);
    expect(await aclManager.isBridge(bridge2.address)).to.be.eq(true);
  });

  it("TC-ACLManager-10 deployer Add and Remove RISK_ADMIN", async () => {
    const {
      deployer,
      users: [, , , , riskAdmin],
    } = testEnv;

    expect(await aclManager.isRiskAdmin(riskAdmin.address)).to.be.eq(false);
    await aclManager.connect(deployer.signer).addRiskAdmin(riskAdmin.address);
    expect(await aclManager.isRiskAdmin(riskAdmin.address)).to.be.eq(true);

    await aclManager
      .connect(deployer.signer)
      .removeRiskAdmin(riskAdmin.address);
    expect(await aclManager.isRiskAdmin(riskAdmin.address)).to.be.eq(false);
  });

  it("TC-ACLManager-11 deployer Add multiple RISK_ADMINS", async () => {
    const {
      deployer,
      users: [riskAdmin1, riskAdmin2],
    } = testEnv;

    await aclManager.connect(deployer.signer).addRiskAdmin(riskAdmin1.address);
    await aclManager.connect(deployer.signer).addRiskAdmin(riskAdmin2.address);
    expect(await aclManager.isRiskAdmin(riskAdmin1.address)).to.be.eq(true);
    expect(await aclManager.isRiskAdmin(riskAdmin2.address)).to.be.eq(true);
  });

  it("TC-ACLManager-12 deployer Add and Remove ASSET_LISTING_ADMIN", async () => {
    const {
      deployer,
      users: [, , , , , assetListingAdmin],
    } = testEnv;

    expect(
      await aclManager.isAssetListingAdmin(assetListingAdmin.address)
    ).to.be.eq(false);

    await aclManager
      .connect(deployer.signer)
      .addAssetListingAdmin(assetListingAdmin.address);
    expect(
      await aclManager.isAssetListingAdmin(assetListingAdmin.address)
    ).to.be.eq(true);

    await aclManager
      .connect(deployer.signer)
      .removeAssetListingAdmin(assetListingAdmin.address);
    expect(
      await aclManager.isAssetListingAdmin(assetListingAdmin.address)
    ).to.be.eq(false);
  });

  it("TC-ACLManager-13 deployer Add multiple ASSET_LISTING_ADMINS", async () => {
    const {
      deployer,
      users: [assetListingAdmin1, assetListingAdmin2],
    } = testEnv;

    await aclManager
      .connect(deployer.signer)
      .addAssetListingAdmin(assetListingAdmin1.address);
    await aclManager
      .connect(deployer.signer)
      .addAssetListingAdmin(assetListingAdmin2.address);
    expect(
      await aclManager.isAssetListingAdmin(assetListingAdmin1.address)
    ).to.be.eq(true);
    expect(
      await aclManager.isAssetListingAdmin(assetListingAdmin2.address)
    ).to.be.eq(true);
  });

  it("TC-ACLManager-14 deployer set and (un)set FLASH_BORROW_ADMIN_ROLE admin of FLASH_BORROWER_ROLE", async () => {
    const {deployer} = testEnv;
    const DEFAULT_ADMIN_ROLE = await aclManager.DEFAULT_ADMIN_ROLE();
    const FLASH_BORROW_ROLE = await aclManager.FLASH_BORROWER_ROLE();
    expect(await aclManager.getRoleAdmin(FLASH_BORROW_ROLE)).to.not.be.eq(
      FLASH_BORROW_ADMIN_ROLE
    );

    await aclManager
      .connect(deployer.signer)
      .setRoleAdmin(FLASH_BORROW_ROLE, FLASH_BORROW_ADMIN_ROLE);
    expect(await aclManager.getRoleAdmin(FLASH_BORROW_ROLE)).to.be.eq(
      FLASH_BORROW_ADMIN_ROLE
    );
    // check set FLASH_BORROW_ROLE's admin role back to default DEFAULT_ADMIN_ROLE
    await aclManager
      .connect(deployer.signer)
      .setRoleAdmin(FLASH_BORROW_ROLE, DEFAULT_ADMIN_ROLE);
    expect(await aclManager.getRoleAdmin(FLASH_BORROW_ROLE)).to.not.be.eq(
      FLASH_BORROW_ADMIN_ROLE
    );
    expect(await aclManager.getRoleAdmin(FLASH_BORROW_ROLE)).to.be.eq(
      DEFAULT_ADMIN_ROLE
    );
  });

  it("TC-ACLManager-15 FLASH_BORROWER_ADMIN Add and Remove FLASH_BORROWER", async () => {
    const {
      deployer,
      users: [flashBorrowAdmin, flashBorrower],
    } = testEnv;
    expect(await aclManager.isFlashBorrower(flashBorrower.address)).to.be.eq(
      false
    );
    const DEFAULT_ADMIN_ROLE = await aclManager.DEFAULT_ADMIN_ROLE();
    const FLASH_BORROW_ROLE = await aclManager.FLASH_BORROWER_ROLE();

    // call grantRole and setRoleAdmin to set a real flashBorrowAdmin role(has right to addFlashBorrower)
    await aclManager
      .connect(deployer.signer)
      .grantRole(FLASH_BORROW_ADMIN_ROLE, flashBorrowAdmin.address);
    await aclManager
      .connect(deployer.signer)
      .setRoleAdmin(FLASH_BORROW_ROLE, FLASH_BORROW_ADMIN_ROLE);

    await aclManager
      .connect(flashBorrowAdmin.signer)
      .addFlashBorrower(flashBorrower.address);

    expect(await aclManager.isFlashBorrower(flashBorrower.address)).to.be.eq(
      true
    );

    await aclManager
      .connect(flashBorrowAdmin.signer)
      .removeFlashBorrower(flashBorrower.address);
    expect(await aclManager.isFlashBorrower(flashBorrower.address)).to.be.eq(
      false
    );

    await aclManager
      .connect(deployer.signer)
      .revokeRole(FLASH_BORROW_ADMIN_ROLE, flashBorrowAdmin.address);
    await aclManager
      .connect(deployer.signer)
      .setRoleAdmin(FLASH_BORROW_ROLE, DEFAULT_ADMIN_ROLE);
  });

  it("TC-ACLManager-16 user only FLASH_BORROW_ADMIN_ROLE granted can NOT addFlashBorrower(NOT setRoleAdmin) - revert expected", async () => {
    const {
      deployer,
      users: [flashBorrowAdmin, flashBorrower],
    } = testEnv;

    await aclManager
      .connect(deployer.signer)
      .grantRole(FLASH_BORROW_ADMIN_ROLE, flashBorrowAdmin.address);

    await expect(
      aclManager
        .connect(flashBorrowAdmin.signer)
        .addFlashBorrower(flashBorrower.address)
    ).to.be.revertedWith(
      `'AccessControl: account ${flashBorrowAdmin.address.toLowerCase()} is missing role ${
        constants.HashZero
      }'`
    );
    expect(await aclManager.isFlashBorrower(flashBorrower.address)).to.be.eq(
      false
    );
    expect(
      await aclManager.hasRole(
        FLASH_BORROW_ADMIN_ROLE,
        flashBorrowAdmin.address
      )
    ).to.be.eq(true);
  });

  it("TC-ACLManager-17 DEFAULT_ADMIN revoke FLASH_BORROW_ROLE should fail(reverted) after changing default FLASH_BORROW_ROLE's admin to others", async () => {
    const {
      deployer,
      users: [flashBorrowAdmin, flashBorrower],
    } = testEnv;
    const FLASH_BORROW_ROLE = await aclManager.FLASH_BORROWER_ROLE();

    await aclManager
      .connect(deployer.signer)
      .grantRole(FLASH_BORROW_ADMIN_ROLE, flashBorrowAdmin.address);
    await aclManager
      .connect(deployer.signer)
      .setRoleAdmin(FLASH_BORROW_ROLE, FLASH_BORROW_ADMIN_ROLE);

    await expect(
      aclManager
        .connect(deployer.signer)
        .removeFlashBorrower(flashBorrower.address)
    ).to.be.revertedWith(
      `'AccessControl: account ${deployer.address.toLowerCase()} is missing role ${FLASH_BORROW_ADMIN_ROLE}'`
    );
  });

  it("TC-ACLManager-18 Tries to deploy ACLManager when ACLAdmin is ZERO_ADDRESS (revert expected)", async () => {
    const {deployer, addressesProvider} = testEnv;

    expect(await addressesProvider.setACLAdmin(ZERO_ADDRESS));
    const deployTx = new ACLManager__factory(deployer.signer).deploy(
      addressesProvider.address
    );
    await expect(deployTx).to.be.revertedWith(
      ProtocolErrors.ACL_ADMIN_CANNOT_BE_ZERO
    );
  });

  it("TC-ACLManager-19 only DEFAULT_ROLE_ADMIN can setRoleAdmin", async () => {
    await setUpAllRoles(testEnv);
    const {
      users: [
        poolAdmin,
        flashBorrowAdmin,
        flashBorrower,
        emergencyAdmin,
        riskAdmin,
        bridge,
        assetListingAdmin,
      ],
    } = testEnv;

    const FLASH_BORROW_ROLE = await aclManager.FLASH_BORROWER_ROLE();
    const beforeRevertFlashBorrowerRoleAdmin = await aclManager.getRoleAdmin(
      FLASH_BORROW_ROLE
    );

    for (const user of [
      poolAdmin,
      flashBorrowAdmin,
      flashBorrower,
      emergencyAdmin,
      riskAdmin,
      bridge,
      assetListingAdmin,
    ]) {
      await expect(
        aclManager
          .connect(user.signer)
          .setRoleAdmin(FLASH_BORROW_ROLE, FLASH_BORROW_ADMIN_ROLE)
      ).to.be.revertedWith(
        `'AccessControl: account ${user.address.toLowerCase()} is missing role ${
          constants.HashZero
        }'`
      );
    }
    const afterRevertFlashBorrowerRoleAdmin = await aclManager.getRoleAdmin(
      FLASH_BORROW_ROLE
    );
    expect(beforeRevertFlashBorrowerRoleAdmin).to.eq(
      afterRevertFlashBorrowerRoleAdmin
    );
  });

  it("TC-ACLManager-20 common users call addPoolAdmin - revert expected", async () => {
    const {
      users: [user1, user2],
    } = testEnv;
    await expect(
      aclManager.connect(user1.signer).addPoolAdmin(user2.address)
    ).to.be.revertedWith(
      `'AccessControl: account ${user1.address.toLowerCase()} is missing role ${
        constants.HashZero
      }'`
    );
    expect(await aclManager.isPoolAdmin(user2.address)).to.be.eq(false);
  });

  it("TC-ACLManager-21 common users call removePoolAdmin - revert expected", async () => {
    const {
      deployer,
      users: [user1, user2],
    } = testEnv;
    await aclManager.connect(deployer.signer).addPoolAdmin(user2.address);
    await expect(
      aclManager.connect(user1.signer).removePoolAdmin(user2.address)
    ).to.be.revertedWith(
      `'AccessControl: account ${user1.address.toLowerCase()} is missing role ${
        constants.HashZero
      }'`
    );
    expect(await aclManager.isPoolAdmin(user2.address)).to.be.eq(true);
  });

  it("TC-ACLManager-22 common users call addEmergencyAdmin - revert expected", async () => {
    const {
      users: [user1, user2],
    } = testEnv;
    await expect(
      aclManager.connect(user1.signer).addEmergencyAdmin(user2.address)
    ).to.be.revertedWith(
      `'AccessControl: account ${user1.address.toLowerCase()} is missing role ${
        constants.HashZero
      }'`
    );
    expect(await aclManager.isEmergencyAdmin(user2.address)).to.be.eq(false);
  });

  it("TC-ACLManager-23 common users call removeEmergencyAdmin - revert expected", async () => {
    const {
      deployer,
      users: [user1, user2],
    } = testEnv;
    await aclManager.connect(deployer.signer).addEmergencyAdmin(user2.address);
    await expect(
      aclManager.connect(user1.signer).removeEmergencyAdmin(user2.address)
    ).to.be.revertedWith(
      `'AccessControl: account ${user1.address.toLowerCase()} is missing role ${
        constants.HashZero
      }'`
    );
    expect(await aclManager.isEmergencyAdmin(user2.address)).to.be.eq(true);
  });

  it("TC-ACLManager-24 common users call addRiskAdmin - revert expected", async () => {
    const {
      users: [user1, user2],
    } = testEnv;
    await expect(
      aclManager.connect(user1.signer).addRiskAdmin(user2.address)
    ).to.be.revertedWith(
      `'AccessControl: account ${user1.address.toLowerCase()} is missing role ${
        constants.HashZero
      }'`
    );
    expect(await aclManager.isRiskAdmin(user2.address)).to.be.eq(false);
  });

  it("TC-ACLManager-25 common users call removeRiskAdmin - revert expected", async () => {
    const {
      deployer,
      users: [user1, user2],
    } = testEnv;
    await aclManager.connect(deployer.signer).addRiskAdmin(user2.address);
    await expect(
      aclManager.connect(user1.signer).removeRiskAdmin(user2.address)
    ).to.be.revertedWith(
      `'AccessControl: account ${user1.address.toLowerCase()} is missing role ${
        constants.HashZero
      }'`
    );
    expect(await aclManager.isRiskAdmin(user2.address)).to.be.eq(true);
  });

  it("TC-ACLManager-26 common users call addFlashBorrower - revert expected", async () => {
    const {
      users: [user1, user2],
    } = testEnv;
    await expect(
      aclManager.connect(user1.signer).addFlashBorrower(user2.address)
    ).to.be.revertedWith(
      `'AccessControl: account ${user1.address.toLowerCase()} is missing role ${
        constants.HashZero
      }'`
    );
    expect(await aclManager.isFlashBorrower(user2.address)).to.be.eq(false);
  });

  it("TC-ACLManager-27 common users call removeFlashBorrower - revert expected", async () => {
    const {
      deployer,
      users: [user1, user2],
    } = testEnv;
    await aclManager.connect(deployer.signer).addFlashBorrower(user2.address);
    await expect(
      aclManager.connect(user1.signer).removeFlashBorrower(user2.address)
    ).to.be.revertedWith(
      `'AccessControl: account ${user1.address.toLowerCase()} is missing role ${
        constants.HashZero
      }'`
    );
    expect(await aclManager.isFlashBorrower(user2.address)).to.be.eq(true);
  });

  it("TC-ACLManager-28 common users call addBridge - revert expected", async () => {
    const {
      users: [user1, user2],
    } = testEnv;
    await expect(
      aclManager.connect(user1.signer).addBridge(user2.address)
    ).to.be.revertedWith(
      `'AccessControl: account ${user1.address.toLowerCase()} is missing role ${
        constants.HashZero
      }'`
    );
    expect(await aclManager.isBridge(user2.address)).to.be.eq(false);
  });

  it("TC-ACLManager-29 common users call removeBridge - revert expected", async () => {
    const {
      deployer,
      users: [user1, user2],
    } = testEnv;
    await aclManager.connect(deployer.signer).addBridge(user2.address);
    await expect(
      aclManager.connect(user1.signer).removeBridge(user2.address)
    ).to.be.revertedWith(
      `'AccessControl: account ${user1.address.toLowerCase()} is missing role ${
        constants.HashZero
      }'`
    );
    expect(await aclManager.isBridge(user2.address)).to.be.eq(true);
  });

  it("TC-ACLManager-30 common users call addAssetListingAdmin - revert expected", async () => {
    const {
      users: [user1, user2],
    } = testEnv;
    await expect(
      aclManager.connect(user1.signer).addAssetListingAdmin(user2.address)
    ).to.be.revertedWith(
      `'AccessControl: account ${user1.address.toLowerCase()} is missing role ${
        constants.HashZero
      }'`
    );
    expect(await aclManager.isAssetListingAdmin(user2.address)).to.be.eq(false);
  });

  it("TC-ACLManager-31 common users call removeAssetListingAdmin - revert expected", async () => {
    const {
      deployer,
      users: [user1, user2],
    } = testEnv;
    await aclManager
      .connect(deployer.signer)
      .addAssetListingAdmin(user2.address);
    await expect(
      aclManager.connect(user1.signer).removeAssetListingAdmin(user2.address)
    ).to.be.revertedWith(
      `'AccessControl: account ${user1.address.toLowerCase()} is missing role ${
        constants.HashZero
      }'`
    );
    expect(await aclManager.isAssetListingAdmin(user2.address)).to.be.eq(true);
  });

  it("TC-ACLManager-32 none Flash borrower admin call addFlashBorrower - revert expected", async () => {
    const {
      deployer,
      users: [
        poolAdmin,
        flashBorrower,
        emergencyAdmin,
        riskAdmin,
        bridge,
        assetListingAdmin,
      ],
    } = testEnv;
    await aclManager.connect(deployer.signer).addPoolAdmin(poolAdmin.address);
    await aclManager
      .connect(deployer.signer)
      .addEmergencyAdmin(emergencyAdmin.address);
    await aclManager.connect(deployer.signer).addRiskAdmin(riskAdmin.address);

    await aclManager.connect(deployer.signer).addBridge(bridge.address);
    await aclManager
      .connect(deployer.signer)
      .addAssetListingAdmin(assetListingAdmin.address);
    for (const user of [
      poolAdmin,
      emergencyAdmin,
      riskAdmin,
      bridge,
      assetListingAdmin,
    ]) {
      await expect(
        aclManager.connect(user.signer).addFlashBorrower(flashBorrower.address)
      ).to.be.revertedWith(
        `'AccessControl: account ${user.address.toLowerCase()} is missing role ${
          constants.HashZero
        }'`
      );
    }
  });

  it("TC-ACLManager-33 none Flash borrower admin call removeFlashBorrower - revert expected", async () => {
    await setUpAllRoles(testEnv);
    const {
      deployer,
      users: [
        poolAdmin,
        ,
        flashBorrower,
        emergencyAdmin,
        riskAdmin,
        bridge,
        assetListingAdmin,
      ],
    } = testEnv;
    expect(await aclManager.isFlashBorrower(flashBorrower.address)).to.be.eq(
      true
    );

    for (const user of [
      deployer,
      poolAdmin,
      flashBorrower,
      emergencyAdmin,
      riskAdmin,
      bridge,
      assetListingAdmin,
    ]) {
      await expect(
        aclManager
          .connect(user.signer)
          .removeFlashBorrower(flashBorrower.address)
      ).to.be.revertedWith(
        `'AccessControl: account ${user.address.toLowerCase()} is missing role ${FLASH_BORROW_ADMIN_ROLE}'`
      );
    }
  });

  it("TC-ACLManager-34 only DEFAULT_ROLE_ADMIN can addPoolAdmin", async () => {
    const commonUser = await Wallet.createRandom().getAddress();
    await setUpAllRoles(testEnv);
    const {
      users: [
        poolAdmin,
        flashBorrowAdmin,
        flashBorrower,
        emergencyAdmin,
        riskAdmin,
        bridge,
        assetListingAdmin,
      ],
    } = testEnv;

    for (const user of [
      poolAdmin,
      flashBorrowAdmin,
      flashBorrower,
      emergencyAdmin,
      riskAdmin,
      bridge,
      assetListingAdmin,
    ]) {
      await expect(
        aclManager.connect(user.signer).addPoolAdmin(commonUser)
      ).to.be.revertedWith(
        `'AccessControl: account ${user.address.toLowerCase()} is missing role ${
          constants.HashZero
        }'`
      );
      expect(await aclManager.isPoolAdmin(commonUser)).to.be.eq(false);
    }
  });

  it("TC-ACLManager-35 only DEFAULT_ROLE_ADMIN can removePoolAdmin", async () => {
    const commonUser = await Wallet.createRandom().getAddress();
    await setUpAllRoles(testEnv);
    const {
      deployer,
      users: [
        poolAdmin,
        flashBorrowAdmin,
        flashBorrower,
        emergencyAdmin,
        riskAdmin,
        bridge,
        assetListingAdmin,
      ],
    } = testEnv;
    await aclManager.connect(deployer.signer).addPoolAdmin(commonUser);
    for (const user of [
      poolAdmin,
      flashBorrowAdmin,
      flashBorrower,
      emergencyAdmin,
      riskAdmin,
      bridge,
      assetListingAdmin,
    ]) {
      await expect(
        aclManager.connect(user.signer).removePoolAdmin(commonUser)
      ).to.be.revertedWith(
        `'AccessControl: account ${user.address.toLowerCase()} is missing role ${
          constants.HashZero
        }'`
      );
      expect(await aclManager.isPoolAdmin(commonUser)).to.be.eq(true);
    }
  });

  it("TC-ACLManager-36 only DEFAULT_ROLE_ADMIN can addEmergencyAdmin", async () => {
    const commonUser = await Wallet.createRandom().getAddress();
    await setUpAllRoles(testEnv);
    const {
      users: [
        poolAdmin,
        flashBorrowAdmin,
        flashBorrower,
        emergencyAdmin,
        riskAdmin,
        bridge,
        assetListingAdmin,
      ],
    } = testEnv;

    for (const user of [
      poolAdmin,
      flashBorrowAdmin,
      flashBorrower,
      emergencyAdmin,
      riskAdmin,
      bridge,
      assetListingAdmin,
    ]) {
      await expect(
        aclManager.connect(user.signer).addEmergencyAdmin(commonUser)
      ).to.be.revertedWith(
        `'AccessControl: account ${user.address.toLowerCase()} is missing role ${
          constants.HashZero
        }'`
      );
      expect(await aclManager.isEmergencyAdmin(commonUser)).to.be.eq(false);
    }
  });

  it("TC-ACLManager-37 only DEFAULT_ROLE_ADMIN can removeEmergencyAdmin", async () => {
    const commonUser = await Wallet.createRandom().getAddress();
    await setUpAllRoles(testEnv);
    const {
      deployer,
      users: [
        poolAdmin,
        flashBorrowAdmin,
        flashBorrower,
        emergencyAdmin,
        riskAdmin,
        bridge,
        assetListingAdmin,
      ],
    } = testEnv;
    await aclManager.connect(deployer.signer).addEmergencyAdmin(commonUser);
    for (const user of [
      poolAdmin,
      flashBorrowAdmin,
      flashBorrower,
      emergencyAdmin,
      riskAdmin,
      bridge,
      assetListingAdmin,
    ]) {
      await expect(
        aclManager.connect(user.signer).removeEmergencyAdmin(commonUser)
      ).to.be.revertedWith(
        `'AccessControl: account ${user.address.toLowerCase()} is missing role ${
          constants.HashZero
        }'`
      );
      expect(await aclManager.isEmergencyAdmin(commonUser)).to.be.eq(true);
    }
  });

  it("TC-ACLManager-38 only DEFAULT_ROLE_ADMIN can addRiskAdmin", async () => {
    const commonUser = await Wallet.createRandom().getAddress();
    await setUpAllRoles(testEnv);
    const {
      users: [
        poolAdmin,
        flashBorrowAdmin,
        flashBorrower,
        emergencyAdmin,
        riskAdmin,
        bridge,
        assetListingAdmin,
      ],
    } = testEnv;

    for (const user of [
      poolAdmin,
      flashBorrowAdmin,
      flashBorrower,
      emergencyAdmin,
      riskAdmin,
      bridge,
      assetListingAdmin,
    ]) {
      await expect(
        aclManager.connect(user.signer).addRiskAdmin(commonUser)
      ).to.be.revertedWith(
        `'AccessControl: account ${user.address.toLowerCase()} is missing role ${
          constants.HashZero
        }'`
      );
      expect(await aclManager.isRiskAdmin(commonUser)).to.be.eq(false);
    }
  });

  it("TC-ACLManager-39 only DEFAULT_ROLE_ADMIN can removeRiskAdmin", async () => {
    const commonUser = await Wallet.createRandom().getAddress();
    await setUpAllRoles(testEnv);
    const {
      deployer,
      users: [
        poolAdmin,
        flashBorrowAdmin,
        flashBorrower,
        emergencyAdmin,
        riskAdmin,
        bridge,
        assetListingAdmin,
      ],
    } = testEnv;
    await aclManager.connect(deployer.signer).addRiskAdmin(commonUser);
    for (const user of [
      poolAdmin,
      flashBorrowAdmin,
      flashBorrower,
      emergencyAdmin,
      riskAdmin,
      bridge,
      assetListingAdmin,
    ]) {
      await expect(
        aclManager.connect(user.signer).removeRiskAdmin(commonUser)
      ).to.be.revertedWith(
        `'AccessControl: account ${user.address.toLowerCase()} is missing role ${
          constants.HashZero
        }'`
      );
      expect(await aclManager.isRiskAdmin(commonUser)).to.be.eq(true);
    }
  });

  it("TC-ACLManager-40 only DEFAULT_ROLE_ADMIN can addBridge", async () => {
    await setUpAllRoles(testEnv);
    const {
      deployer,
      users: [
        poolAdmin,
        flashBorrowAdmin,
        flashBorrower,
        emergencyAdmin,
        riskAdmin,
        bridge,
        assetListingAdmin,
      ],
    } = testEnv;
    await aclManager.connect(deployer.signer).removeBridge(bridge.address);
    for (const user of [
      poolAdmin,
      flashBorrowAdmin,
      flashBorrower,
      emergencyAdmin,
      riskAdmin,
      bridge,
      assetListingAdmin,
    ]) {
      await expect(
        aclManager.connect(user.signer).addBridge(bridge.address)
      ).to.be.revertedWith(
        `'AccessControl: account ${user.address.toLowerCase()} is missing role ${
          constants.HashZero
        }'`
      );
      expect(await aclManager.isBridge(bridge.address)).to.be.eq(false);
    }
  });

  it("TC-ACLManager-41 only DEFAULT_ROLE_ADMIN can removeBridge", async () => {
    await setUpAllRoles(testEnv);
    const {
      users: [
        poolAdmin,
        flashBorrowAdmin,
        flashBorrower,
        emergencyAdmin,
        riskAdmin,
        bridge,
        assetListingAdmin,
      ],
    } = testEnv;

    for (const user of [
      poolAdmin,
      flashBorrowAdmin,
      flashBorrower,
      emergencyAdmin,
      riskAdmin,
      bridge,
      assetListingAdmin,
    ]) {
      await expect(
        aclManager.connect(user.signer).removeBridge(bridge.address)
      ).to.be.revertedWith(
        `'AccessControl: account ${user.address.toLowerCase()} is missing role ${
          constants.HashZero
        }'`
      );
      expect(await aclManager.isBridge(bridge.address)).to.be.eq(true);
    }
  });

  it("TC-ACLManager-42 only DEFAULT_ROLE_ADMIN can addAssetListingAdmin", async () => {
    await setUpAllRoles(testEnv);
    const {
      deployer,
      users: [
        poolAdmin,
        flashBorrowAdmin,
        flashBorrower,
        emergencyAdmin,
        riskAdmin,
        bridge,
        assetListingAdmin,
      ],
    } = testEnv;
    await aclManager
      .connect(deployer.signer)
      .removeAssetListingAdmin(assetListingAdmin.address);
    for (const user of [
      poolAdmin,
      flashBorrowAdmin,
      flashBorrower,
      emergencyAdmin,
      riskAdmin,
      bridge,
      assetListingAdmin,
    ]) {
      await expect(
        aclManager
          .connect(user.signer)
          .addAssetListingAdmin(assetListingAdmin.address)
      ).to.be.revertedWith(
        `'AccessControl: account ${user.address.toLowerCase()} is missing role ${
          constants.HashZero
        }'`
      );
      expect(
        await aclManager.isAssetListingAdmin(assetListingAdmin.address)
      ).to.be.eq(false);
    }
  });

  it("TC-ACLManager-43 only DEFAULT_ROLE_ADMIN can removeAssetListingAdmin", async () => {
    await setUpAllRoles(testEnv);
    const {
      users: [
        poolAdmin,
        flashBorrowAdmin,
        flashBorrower,
        emergencyAdmin,
        riskAdmin,
        bridge,
        assetListingAdmin,
      ],
    } = testEnv;

    for (const user of [
      poolAdmin,
      flashBorrowAdmin,
      flashBorrower,
      emergencyAdmin,
      riskAdmin,
      bridge,
      assetListingAdmin,
    ]) {
      await expect(
        aclManager
          .connect(user.signer)
          .removeAssetListingAdmin(assetListingAdmin.address)
      ).to.be.revertedWith(
        `'AccessControl: account ${user.address.toLowerCase()} is missing role ${
          constants.HashZero
        }'`
      );
      expect(
        await aclManager.isAssetListingAdmin(assetListingAdmin.address)
      ).to.be.eq(true);
    }
  });
});
