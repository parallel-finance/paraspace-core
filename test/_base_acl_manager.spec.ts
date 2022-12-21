import {expect} from "chai";
import {createRandomAddress} from "../helpers/misc-utils";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {constants, utils, Wallet} from "ethers";
import {ZERO_ADDRESS} from "../helpers/constants";
import {ProtocolErrors} from "../helpers/types";
import {ACLManager__factory} from "../types";
import {testEnvFixture} from "./helpers/setup-env";

const fixture = async () => {
  const testEnv = await loadFixture(testEnvFixture);
  const {users, addressesProvider} = testEnv;
  const aclManager = await new ACLManager__factory(users[3].signer).deploy(
    addressesProvider.address
  );
  return {...testEnv, aclManager};
};

const FLASH_BORROW_ADMIN_ROLE = utils.keccak256(
  utils.formatBytes32String("FLASH_BORROWER_ADMIN")
);

// return all roles with each of them has only one role
const fixtureWithRoles = async () => {
  const testEnv = await loadFixture(testEnvFixture);
  const {users, addressesProvider, emergencyAdmin} = testEnv;
  const aclManager = await new ACLManager__factory(users[3].signer).deploy(
    addressesProvider.address
  );

  const DEFAULT_ADMIN_ROLE = await aclManager.DEFAULT_ADMIN_ROLE();
  const FLASH_BORROW_ROLE = await aclManager.FLASH_BORROWER_ROLE();
  expect(
    await aclManager.hasRole(DEFAULT_ADMIN_ROLE, users[3].address)
  ).to.be.eq(true);

  const newPoolAdmin = users[1];
  await aclManager.connect(users[3].signer).addPoolAdmin(newPoolAdmin.address);
  expect(await aclManager.isPoolAdmin(newPoolAdmin.address)).to.be.eq(true);

  const newAssetListingAdmin = users[0];
  await aclManager
    .connect(users[3].signer)
    .addAssetListingAdmin(newAssetListingAdmin.address);
  expect(
    await aclManager.isAssetListingAdmin(newAssetListingAdmin.address)
  ).to.be.eq(true);

  const bridge = users[4];
  await aclManager.connect(users[3].signer).addBridge(users[4].address);
  expect(await aclManager.isBridge(users[4].address)).to.be.eq(true);
  const newRiskAdmin = users[5];
  await aclManager.connect(users[3].signer).addRiskAdmin(newRiskAdmin.address);
  expect(await aclManager.isRiskAdmin(newRiskAdmin.address)).to.be.eq(true);

  const flashBorrowAdmin = users[6];
  await aclManager
    .connect(users[3].signer)
    .grantRole(FLASH_BORROW_ADMIN_ROLE, users[6].address);
  await aclManager
    .connect(users[3].signer)
    .setRoleAdmin(FLASH_BORROW_ROLE, FLASH_BORROW_ADMIN_ROLE);
  expect(
    await aclManager.hasRole(FLASH_BORROW_ADMIN_ROLE, users[6].address)
  ).to.be.eq(true);

  const flashBorrower = users[7];
  await aclManager.connect(users[6].signer).addFlashBorrower(users[7].address);
  expect(await aclManager.isFlashBorrower(users[7].address)).to.be.eq(true);

  await aclManager
    .connect(users[3].signer)
    .addEmergencyAdmin(emergencyAdmin.address);
  expect(await aclManager.isEmergencyAdmin(emergencyAdmin.address)).to.be.eq(
    true
  );

  return {
    ...testEnv,
    aclManager,
    newPoolAdmin,
    newAssetListingAdmin,
    bridge,
    newRiskAdmin,
    flashBorrowAdmin,
    flashBorrower,
    emergencyAdmin,
  };
};
describe("Access Control List Manager", () => {
  // check tasks/deployments/05_aclManager.ts for detail deploy script
  it("TC-ACLManager-01 Check default admin role after deployed", async () => {
    const {deployer, aclManager, users} = await loadFixture(fixture);
    // check ParaSpaceAdminIndex in helpers/contracts-helpers.ts has been set to DEFAULT_ADMIN_ROLE by Line 43 in scripts/deployments/steps/20_renounceOwnership.ts
    const DEFAULT_ADMIN_ROLE = await aclManager.DEFAULT_ADMIN_ROLE();
    expect(
      await aclManager.hasRole(DEFAULT_ADMIN_ROLE, users[3].address)
    ).to.be.eq(true);
    // and so, deployer is no longger DEFAULT_ADMIN_ROLE
    expect(
      await aclManager.hasRole(DEFAULT_ADMIN_ROLE, deployer.address)
    ).to.be.eq(false);
  });

  it("TC-ACLManager-02 DEFAULT_ADMIN_ROLE Grant and Revoke FLASH_BORROW_ADMIN role", async () => {
    const {aclManager, users} = await loadFixture(fixture);
    const commonUser = createRandomAddress();
    expect(
      await aclManager.hasRole(FLASH_BORROW_ADMIN_ROLE, commonUser)
    ).to.be.eq(false);
    await aclManager
      .connect(users[3].signer)
      .grantRole(FLASH_BORROW_ADMIN_ROLE, commonUser);
    expect(
      await aclManager.hasRole(FLASH_BORROW_ADMIN_ROLE, commonUser)
    ).to.be.eq(true);
    await aclManager
      .connect(users[3].signer)
      .revokeRole(FLASH_BORROW_ADMIN_ROLE, commonUser);
    expect(
      await aclManager.hasRole(FLASH_BORROW_ADMIN_ROLE, commonUser)
    ).to.be.eq(false);
  });

  it("TC-ACLManager-03 DEFAULT_ADMIN_ROLE Add and Remove POOL_ADMIN", async () => {
    const {
      users,
      aclManager,
      users: [, poolAdmin],
    } = await loadFixture(fixture);

    expect(await aclManager.isPoolAdmin(poolAdmin.address)).to.be.eq(false);

    await aclManager.connect(users[3].signer).addPoolAdmin(poolAdmin.address);
    expect(await aclManager.isPoolAdmin(poolAdmin.address)).to.be.eq(true);

    await aclManager
      .connect(users[3].signer)
      .removePoolAdmin(poolAdmin.address);
    expect(await aclManager.isPoolAdmin(poolAdmin.address)).to.be.eq(false);
  });

  it("TC-ACLManager-04 DEFAULT_ADMIN_ROLE Add multiple POOL_ADMINS", async () => {
    const {
      users,
      aclManager,
      users: [poolAdmin1, poolAdmin2],
    } = await loadFixture(fixture);
    await aclManager.connect(users[3].signer).addPoolAdmin(poolAdmin1.address);
    await aclManager.connect(users[3].signer).addPoolAdmin(poolAdmin2.address);
    expect(await aclManager.isPoolAdmin(poolAdmin1.address)).to.be.eq(true);
    expect(await aclManager.isPoolAdmin(poolAdmin2.address)).to.be.eq(true);
  });

  it("TC-ACLManager-05 DEFAULT_ADMIN_ROLE Add and Remove EMERGENCY_ADMIN", async () => {
    const {
      users,
      aclManager,
      users: [, , emergencyAdmin],
    } = await loadFixture(fixture);

    expect(await aclManager.isEmergencyAdmin(emergencyAdmin.address)).to.be.eq(
      false
    );
    await aclManager
      .connect(users[3].signer)
      .addEmergencyAdmin(emergencyAdmin.address);
    expect(await aclManager.isEmergencyAdmin(emergencyAdmin.address)).to.be.eq(
      true
    );

    await aclManager
      .connect(users[3].signer)
      .removeEmergencyAdmin(emergencyAdmin.address);
    expect(await aclManager.isEmergencyAdmin(emergencyAdmin.address)).to.be.eq(
      false
    );
  });

  it("TC-ACLManager-06 DEFAULT_ADMIN_ROLE Add multiple EMERGENCY_ADMINS", async () => {
    const {
      users,
      aclManager,
      users: [emergencyAdmin1, emergencyAdmin2],
    } = await loadFixture(fixture);

    await aclManager
      .connect(users[3].signer)
      .addEmergencyAdmin(emergencyAdmin1.address);
    await aclManager
      .connect(users[3].signer)
      .addEmergencyAdmin(emergencyAdmin2.address);
    expect(await aclManager.isEmergencyAdmin(emergencyAdmin1.address)).to.be.eq(
      true
    );
    expect(await aclManager.isEmergencyAdmin(emergencyAdmin2.address)).to.be.eq(
      true
    );
  });

  it("TC-ACLManager-07 DEFAULT_ADMIN_ROLE Add and Remove BRIDGE", async () => {
    const {
      users,
      aclManager,
      users: [, , , bridge],
    } = await loadFixture(fixture);

    expect(await aclManager.isBridge(bridge.address)).to.be.eq(false);
    await aclManager.connect(users[3].signer).addBridge(bridge.address);
    expect(await aclManager.isBridge(bridge.address)).to.be.eq(true);

    await aclManager.connect(users[3].signer).removeBridge(bridge.address);
    expect(await aclManager.isBridge(bridge.address)).to.be.eq(false);
  });

  it("TC-ACLManager-08 DEFAULT_ADMIN_ROLE Add multiple BRIDGEs", async () => {
    const {
      users,
      aclManager,
      users: [bridge1, bridge2],
    } = await loadFixture(fixture);

    await aclManager.connect(users[3].signer).addBridge(bridge1.address);
    await aclManager.connect(users[3].signer).addBridge(bridge2.address);
    expect(await aclManager.isBridge(bridge1.address)).to.be.eq(true);
    expect(await aclManager.isBridge(bridge2.address)).to.be.eq(true);
  });

  it("TC-ACLManager-09 DEFAULT_ADMIN_ROLE Add and Remove RISK_ADMIN", async () => {
    const {
      users,
      aclManager,
      users: [, , , , riskAdmin],
    } = await loadFixture(fixture);

    expect(await aclManager.isRiskAdmin(riskAdmin.address)).to.be.eq(false);
    await aclManager.connect(users[3].signer).addRiskAdmin(riskAdmin.address);
    expect(await aclManager.isRiskAdmin(riskAdmin.address)).to.be.eq(true);

    await aclManager
      .connect(users[3].signer)
      .removeRiskAdmin(riskAdmin.address);
    expect(await aclManager.isRiskAdmin(riskAdmin.address)).to.be.eq(false);
  });

  it("TC-ACLManager-10 DEFAULT_ADMIN_ROLE Add multiple RISK_ADMINS", async () => {
    const {
      users,
      aclManager,
      users: [riskAdmin1, riskAdmin2],
    } = await loadFixture(fixture);

    await aclManager.connect(users[3].signer).addRiskAdmin(riskAdmin1.address);
    await aclManager.connect(users[3].signer).addRiskAdmin(riskAdmin2.address);
    expect(await aclManager.isRiskAdmin(riskAdmin1.address)).to.be.eq(true);
    expect(await aclManager.isRiskAdmin(riskAdmin2.address)).to.be.eq(true);
  });

  it("TC-ACLManager-11 DEFAULT_ADMIN_ROLE Add and Remove ASSET_LISTING_ADMIN", async () => {
    const {
      users,
      aclManager,
      users: [, , , , , assetListingAdmin],
    } = await loadFixture(fixture);

    expect(
      await aclManager.isAssetListingAdmin(assetListingAdmin.address)
    ).to.be.eq(false);

    await aclManager
      .connect(users[3].signer)
      .addAssetListingAdmin(assetListingAdmin.address);
    expect(
      await aclManager.isAssetListingAdmin(assetListingAdmin.address)
    ).to.be.eq(true);

    await aclManager
      .connect(users[3].signer)
      .removeAssetListingAdmin(assetListingAdmin.address);
    expect(
      await aclManager.isAssetListingAdmin(assetListingAdmin.address)
    ).to.be.eq(false);
  });

  it("TC-ACLManager-12 DEFAULT_ADMIN_ROLE Add multiple ASSET_LISTING_ADMINS", async () => {
    const {
      users,
      aclManager,
      users: [assetListingAdmin1, assetListingAdmin2],
    } = await loadFixture(fixture);

    await aclManager
      .connect(users[3].signer)
      .addAssetListingAdmin(assetListingAdmin1.address);
    await aclManager
      .connect(users[3].signer)
      .addAssetListingAdmin(assetListingAdmin2.address);
    expect(
      await aclManager.isAssetListingAdmin(assetListingAdmin1.address)
    ).to.be.eq(true);
    expect(
      await aclManager.isAssetListingAdmin(assetListingAdmin2.address)
    ).to.be.eq(true);
  });

  it("TC-ACLManager-13 DEFAULT_ADMIN_ROLE set and (un)set FLASH_BORROW_ADMIN_ROLE admin of FLASH_BORROWER_ROLE", async () => {
    const {users, aclManager} = await loadFixture(fixture);
    const DEFAULT_ADMIN_ROLE = await aclManager.DEFAULT_ADMIN_ROLE();
    const FLASH_BORROW_ROLE = await aclManager.FLASH_BORROWER_ROLE();
    expect(await aclManager.getRoleAdmin(FLASH_BORROW_ROLE)).to.not.be.eq(
      FLASH_BORROW_ADMIN_ROLE
    );

    await aclManager
      .connect(users[3].signer)
      .setRoleAdmin(FLASH_BORROW_ROLE, FLASH_BORROW_ADMIN_ROLE);
    expect(await aclManager.getRoleAdmin(FLASH_BORROW_ROLE)).to.be.eq(
      FLASH_BORROW_ADMIN_ROLE
    );
    // check set FLASH_BORROW_ROLE's admin role back to default DEFAULT_ADMIN_ROLE
    await aclManager
      .connect(users[3].signer)
      .setRoleAdmin(FLASH_BORROW_ROLE, DEFAULT_ADMIN_ROLE);
    expect(await aclManager.getRoleAdmin(FLASH_BORROW_ROLE)).to.not.be.eq(
      FLASH_BORROW_ADMIN_ROLE
    );
    expect(await aclManager.getRoleAdmin(FLASH_BORROW_ROLE)).to.be.eq(
      DEFAULT_ADMIN_ROLE
    );
  });

  it("TC-ACLManager-14 FLASH_BORROWER_ADMIN Add and Remove FLASH_BORROWER", async () => {
    const {
      users,
      aclManager,
      users: [flashBorrowAdmin, flashBorrower],
    } = await loadFixture(fixture);
    expect(await aclManager.isFlashBorrower(flashBorrower.address)).to.be.eq(
      false
    );
    const DEFAULT_ADMIN_ROLE = await aclManager.DEFAULT_ADMIN_ROLE();
    const FLASH_BORROW_ROLE = await aclManager.FLASH_BORROWER_ROLE();
    // call grantRole and setRoleAdmin to set a real flashBorrowAdmin role(has right to addFlashBorrower)
    await aclManager
      .connect(users[3].signer)
      .grantRole(FLASH_BORROW_ADMIN_ROLE, flashBorrowAdmin.address);
    await aclManager
      .connect(users[3].signer)
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
      .connect(users[3].signer)
      .revokeRole(FLASH_BORROW_ADMIN_ROLE, flashBorrowAdmin.address);
    await aclManager
      .connect(users[3].signer)
      .setRoleAdmin(FLASH_BORROW_ROLE, DEFAULT_ADMIN_ROLE);
  });

  it("TC-ACLManager-15 user only FLASH_BORROW_ADMIN_ROLE granted can NOT addFlashBorrower(NOT setRoleAdmin) - revert expected", async () => {
    const {
      users,
      aclManager,
      users: [flashBorrowAdmin, flashBorrower],
    } = await loadFixture(fixture);

    await aclManager
      .connect(users[3].signer)
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

  it("TC-ACLManager-16 DEFAULT_ADMIN revoke FLASH_BORROW_ROLE should fail(reverted) after changing default FLASH_BORROW_ROLE's admin to others", async () => {
    const {
      users,
      aclManager,
      users: [flashBorrowAdmin, flashBorrower],
    } = await loadFixture(fixture);
    const FLASH_BORROW_ROLE = await aclManager.FLASH_BORROWER_ROLE();

    await aclManager
      .connect(users[3].signer)
      .grantRole(FLASH_BORROW_ADMIN_ROLE, flashBorrowAdmin.address);
    await aclManager
      .connect(users[3].signer)
      .setRoleAdmin(FLASH_BORROW_ROLE, FLASH_BORROW_ADMIN_ROLE);

    await expect(
      aclManager
        .connect(users[3].signer)
        .removeFlashBorrower(flashBorrower.address)
    ).to.be.revertedWith(
      `'AccessControl: account ${users[3].address.toLowerCase()} is missing role ${FLASH_BORROW_ADMIN_ROLE}'`
    );
  });

  it("TC-ACLManager-17 Tries to deploy ACLManager when ACLAdmin is ZERO_ADDRESS (revert expected)", async () => {
    const {deployer, addressesProvider} = await loadFixture(fixture);

    expect(await addressesProvider.setACLAdmin(ZERO_ADDRESS));
    const deployTx = new ACLManager__factory(deployer.signer).deploy(
      addressesProvider.address
    );
    await expect(deployTx).to.be.revertedWith(
      ProtocolErrors.ACL_ADMIN_CANNOT_BE_ZERO
    );
  });

  it("TC-ACLManager-18 common users call addPoolAdmin - revert expected", async () => {
    const {
      aclManager,
      users: [, , , , , , user1, user2],
    } = await loadFixture(fixture);
    await expect(
      aclManager.connect(user1.signer).addPoolAdmin(user2.address)
    ).to.be.revertedWith(
      `'AccessControl: account ${user1.address.toLowerCase()} is missing role ${
        constants.HashZero
      }'`
    );
    expect(await aclManager.isPoolAdmin(user2.address)).to.be.eq(false);
  });

  it("TC-ACLManager-19 common users call removePoolAdmin - revert expected", async () => {
    const {
      aclManager,
      users: [, , , user3, , , user1, user2],
    } = await loadFixture(fixture);
    await aclManager.connect(user3.signer).addPoolAdmin(user2.address);
    await expect(
      aclManager.connect(user1.signer).removePoolAdmin(user2.address)
    ).to.be.revertedWith(
      `'AccessControl: account ${user1.address.toLowerCase()} is missing role ${
        constants.HashZero
      }'`
    );
    expect(await aclManager.isPoolAdmin(user2.address)).to.be.eq(true);
  });

  it("TC-ACLManager-20 common users call addEmergencyAdmin - revert expected", async () => {
    const {
      aclManager,
      users: [, , , , , , user1, user2],
    } = await loadFixture(fixture);
    await expect(
      aclManager.connect(user1.signer).addEmergencyAdmin(user2.address)
    ).to.be.revertedWith(
      `'AccessControl: account ${user1.address.toLowerCase()} is missing role ${
        constants.HashZero
      }'`
    );
    expect(await aclManager.isEmergencyAdmin(user2.address)).to.be.eq(false);
  });

  it("TC-ACLManager-21 common users call removeEmergencyAdmin - revert expected", async () => {
    const {
      aclManager,
      users: [, , , user3, , , user1, user2],
    } = await loadFixture(fixture);
    await aclManager.connect(user3.signer).addEmergencyAdmin(user2.address);
    await expect(
      aclManager.connect(user1.signer).removeEmergencyAdmin(user2.address)
    ).to.be.revertedWith(
      `'AccessControl: account ${user1.address.toLowerCase()} is missing role ${
        constants.HashZero
      }'`
    );
    expect(await aclManager.isEmergencyAdmin(user2.address)).to.be.eq(true);
  });

  it("TC-ACLManager-22 common users call addRiskAdmin - revert expected", async () => {
    const {
      aclManager,
      users: [, , , , , , user1, user2],
    } = await loadFixture(fixture);
    await expect(
      aclManager.connect(user1.signer).addRiskAdmin(user2.address)
    ).to.be.revertedWith(
      `'AccessControl: account ${user1.address.toLowerCase()} is missing role ${
        constants.HashZero
      }'`
    );
    expect(await aclManager.isRiskAdmin(user2.address)).to.be.eq(false);
  });

  it("TC-ACLManager-23 common users call removeRiskAdmin - revert expected", async () => {
    const {
      aclManager,
      users: [, , , user3, , , user1, user2],
    } = await loadFixture(fixture);
    await aclManager.connect(user3.signer).addRiskAdmin(user2.address);
    await expect(
      aclManager.connect(user1.signer).removeRiskAdmin(user2.address)
    ).to.be.revertedWith(
      `'AccessControl: account ${user1.address.toLowerCase()} is missing role ${
        constants.HashZero
      }'`
    );
    expect(await aclManager.isRiskAdmin(user2.address)).to.be.eq(true);
  });

  it("TC-ACLManager-24 common users call addFlashBorrower - revert expected", async () => {
    const {
      aclManager,
      users: [, , , , , , user1, user2],
    } = await loadFixture(fixture);
    await expect(
      aclManager.connect(user1.signer).addFlashBorrower(user2.address)
    ).to.be.revertedWith(
      `'AccessControl: account ${user1.address.toLowerCase()} is missing role ${
        constants.HashZero
      }'`
    );
    expect(await aclManager.isFlashBorrower(user2.address)).to.be.eq(false);
  });

  it("TC-ACLManager-25 common users call removeFlashBorrower - revert expected", async () => {
    const {
      aclManager,
      users: [, , , user3, , , user1, user2],
    } = await loadFixture(fixture);
    await aclManager.connect(user3.signer).addFlashBorrower(user2.address);
    await expect(
      aclManager.connect(user1.signer).removeFlashBorrower(user2.address)
    ).to.be.revertedWith(
      `'AccessControl: account ${user1.address.toLowerCase()} is missing role ${
        constants.HashZero
      }'`
    );
    expect(await aclManager.isFlashBorrower(user2.address)).to.be.eq(true);
  });

  it("TC-ACLManager-26 common users call addBridge - revert expected", async () => {
    const {
      aclManager,
      users: [, , , , , , user1, user2],
    } = await loadFixture(fixture);
    await expect(
      aclManager.connect(user1.signer).addBridge(user2.address)
    ).to.be.revertedWith(
      `'AccessControl: account ${user1.address.toLowerCase()} is missing role ${
        constants.HashZero
      }'`
    );
    expect(await aclManager.isBridge(user2.address)).to.be.eq(false);
  });

  it("TC-ACLManager-27 common users call removeBridge - revert expected", async () => {
    const {
      aclManager,
      users: [, , , user3, , , user1, user2],
    } = await loadFixture(fixture);
    await aclManager.connect(user3.signer).addBridge(user2.address);
    await expect(
      aclManager.connect(user1.signer).removeBridge(user2.address)
    ).to.be.revertedWith(
      `'AccessControl: account ${user1.address.toLowerCase()} is missing role ${
        constants.HashZero
      }'`
    );
    expect(await aclManager.isBridge(user2.address)).to.be.eq(true);
  });

  it("TC-ACLManager-28 common users call addAssetListingAdmin - revert expected", async () => {
    const {
      aclManager,
      users: [, , , , , , user1, user2],
    } = await loadFixture(fixture);
    await expect(
      aclManager.connect(user1.signer).addAssetListingAdmin(user2.address)
    ).to.be.revertedWith(
      `'AccessControl: account ${user1.address.toLowerCase()} is missing role ${
        constants.HashZero
      }'`
    );
    expect(await aclManager.isAssetListingAdmin(user2.address)).to.be.eq(false);
  });

  it("TC-ACLManager-29 common users call removeAssetListingAdmin - revert expected", async () => {
    const {
      aclManager,
      users: [, , , user3, , , user1, user2],
    } = await loadFixture(fixture);
    await aclManager.connect(user3.signer).addAssetListingAdmin(user2.address);
    await expect(
      aclManager.connect(user1.signer).removeAssetListingAdmin(user2.address)
    ).to.be.revertedWith(
      `'AccessControl: account ${user1.address.toLowerCase()} is missing role ${
        constants.HashZero
      }'`
    );
    expect(await aclManager.isAssetListingAdmin(user2.address)).to.be.eq(true);
  });

  it("TC-ACLManager-30 only DEFAULT_ROLE_ADMIN can setRoleAdmin", async () => {
    const {
      aclManager,
      newPoolAdmin,
      newAssetListingAdmin,
      bridge,
      newRiskAdmin,
      flashBorrowAdmin,
      flashBorrower,
      emergencyAdmin,
    } = await loadFixture(fixtureWithRoles);

    const FLASH_BORROW_ROLE = await aclManager.FLASH_BORROWER_ROLE();
    const beforeRevertFlashBorrowerRoleAdmin = await aclManager.getRoleAdmin(
      FLASH_BORROW_ROLE
    );

    for (const admin of [
      newPoolAdmin,
      newAssetListingAdmin,
      bridge,
      newRiskAdmin,
      flashBorrowAdmin,
      flashBorrower,
      emergencyAdmin,
    ]) {
      await expect(
        aclManager
          .connect(admin.signer)
          .setRoleAdmin(FLASH_BORROW_ROLE, FLASH_BORROW_ADMIN_ROLE)
      ).to.be.revertedWith(
        `'AccessControl: account ${admin.address.toLowerCase()} is missing role ${
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

  it("TC-ACLManager-31 none Flash borrower admin call addFlashBorrower - revert expected", async () => {
    const {
      aclManager,
      newPoolAdmin,
      newAssetListingAdmin,
      bridge,
      newRiskAdmin,
      flashBorrower,
      emergencyAdmin,
      users,
    } = await loadFixture(fixtureWithRoles);
    for (const user of [
      newPoolAdmin,
      newAssetListingAdmin,
      bridge,
      newRiskAdmin,
      flashBorrower,
      emergencyAdmin,
      users[3],
    ]) {
      await expect(
        aclManager.connect(user.signer).addFlashBorrower(flashBorrower.address)
      ).to.be.revertedWith(
        `'AccessControl: account ${user.address.toLowerCase()} is missing role ${FLASH_BORROW_ADMIN_ROLE}'`
      );
    }
  });

  it("TC-ACLManager-32 none Flash borrower admin call removeFlashBorrower - revert expected", async () => {
    const {
      aclManager,
      newPoolAdmin,
      newAssetListingAdmin,
      bridge,
      newRiskAdmin,
      flashBorrower,
      emergencyAdmin,
      users,
    } = await loadFixture(fixtureWithRoles);

    for (const user of [
      newPoolAdmin,
      newAssetListingAdmin,
      bridge,
      newRiskAdmin,
      flashBorrower,
      emergencyAdmin,
      users[3],
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

  it("TC-ACLManager-33 only DEFAULT_ROLE_ADMIN can addPoolAdmin", async () => {
    const {
      aclManager,
      newPoolAdmin,
      newAssetListingAdmin,
      bridge,
      newRiskAdmin,
      flashBorrowAdmin,
      flashBorrower,
      emergencyAdmin,
    } = await loadFixture(fixtureWithRoles);
    const commonUser = createRandomAddress();

    for (const user of [
      newPoolAdmin,
      newAssetListingAdmin,
      bridge,
      newRiskAdmin,
      flashBorrowAdmin,
      flashBorrower,
      emergencyAdmin,
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

  it("TC-ACLManager-34 only DEFAULT_ROLE_ADMIN can removePoolAdmin", async () => {
    const commonUser = await Wallet.createRandom().getAddress();
    const {
      aclManager,
      newPoolAdmin,
      newAssetListingAdmin,
      bridge,
      newRiskAdmin,
      flashBorrowAdmin,
      flashBorrower,
      emergencyAdmin,
      users,
    } = await loadFixture(fixtureWithRoles);
    await aclManager.connect(users[3].signer).addPoolAdmin(commonUser);
    expect(await aclManager.isPoolAdmin(commonUser)).to.be.eq(true);

    for (const user of [
      newPoolAdmin,
      newAssetListingAdmin,
      bridge,
      newRiskAdmin,
      flashBorrowAdmin,
      flashBorrower,
      emergencyAdmin,
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

  it("TC-ACLManager-35 only DEFAULT_ROLE_ADMIN can addEmergencyAdmin", async () => {
    const commonUser = await Wallet.createRandom().getAddress();
    const {
      aclManager,
      newPoolAdmin,
      newAssetListingAdmin,
      bridge,
      newRiskAdmin,
      flashBorrowAdmin,
      flashBorrower,
      emergencyAdmin,
    } = await loadFixture(fixtureWithRoles);

    for (const user of [
      newPoolAdmin,
      newAssetListingAdmin,
      bridge,
      newRiskAdmin,
      flashBorrowAdmin,
      flashBorrower,
      emergencyAdmin,
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

  it("TC-ACLManager-36 only DEFAULT_ROLE_ADMIN can removeEmergencyAdmin", async () => {
    const commonUser = await Wallet.createRandom().getAddress();
    const {
      aclManager,
      newPoolAdmin,
      newAssetListingAdmin,
      bridge,
      newRiskAdmin,
      flashBorrowAdmin,
      flashBorrower,
      emergencyAdmin,
      users,
    } = await loadFixture(fixtureWithRoles);

    await aclManager.connect(users[3].signer).addEmergencyAdmin(commonUser);
    for (const user of [
      newPoolAdmin,
      newAssetListingAdmin,
      bridge,
      newRiskAdmin,
      flashBorrowAdmin,
      flashBorrower,
      emergencyAdmin,
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

  it("TC-ACLManager-37 only DEFAULT_ROLE_ADMIN can addRiskAdmin", async () => {
    const commonUser = await Wallet.createRandom().getAddress();
    const {
      aclManager,
      newPoolAdmin,
      newAssetListingAdmin,
      bridge,
      newRiskAdmin,
      flashBorrowAdmin,
      flashBorrower,
      emergencyAdmin,
    } = await loadFixture(fixtureWithRoles);

    for (const user of [
      newPoolAdmin,
      newAssetListingAdmin,
      bridge,
      newRiskAdmin,
      flashBorrowAdmin,
      flashBorrower,
      emergencyAdmin,
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

  it("TC-ACLManager-38 only DEFAULT_ROLE_ADMIN can removeRiskAdmin", async () => {
    const commonUser = await Wallet.createRandom().getAddress();
    const {
      aclManager,
      newPoolAdmin,
      newAssetListingAdmin,
      bridge,
      newRiskAdmin,
      flashBorrowAdmin,
      flashBorrower,
      emergencyAdmin,
      users,
    } = await loadFixture(fixtureWithRoles);
    await aclManager.connect(users[3].signer).addRiskAdmin(commonUser);
    for (const user of [
      newPoolAdmin,
      newAssetListingAdmin,
      bridge,
      newRiskAdmin,
      flashBorrowAdmin,
      flashBorrower,
      emergencyAdmin,
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

  it("TC-ACLManager-39 only DEFAULT_ROLE_ADMIN can addBridge", async () => {
    const commonUser = await Wallet.createRandom().getAddress();
    const {
      aclManager,
      newPoolAdmin,
      newAssetListingAdmin,
      bridge,
      newRiskAdmin,
      flashBorrowAdmin,
      flashBorrower,
      emergencyAdmin,
    } = await loadFixture(fixtureWithRoles);
    for (const user of [
      newPoolAdmin,
      newAssetListingAdmin,
      bridge,
      newRiskAdmin,
      flashBorrowAdmin,
      flashBorrower,
      emergencyAdmin,
    ]) {
      await expect(
        aclManager.connect(user.signer).addBridge(commonUser)
      ).to.be.revertedWith(
        `'AccessControl: account ${user.address.toLowerCase()} is missing role ${
          constants.HashZero
        }'`
      );
      expect(await aclManager.isBridge(commonUser)).to.be.eq(false);
    }
  });

  it("TC-ACLManager-40 only DEFAULT_ROLE_ADMIN can removeBridge", async () => {
    const commonUser = await Wallet.createRandom().getAddress();
    const {
      aclManager,
      newPoolAdmin,
      newAssetListingAdmin,
      bridge,
      newRiskAdmin,
      flashBorrowAdmin,
      flashBorrower,
      emergencyAdmin,
      users,
    } = await loadFixture(fixtureWithRoles);
    await aclManager.connect(users[3].signer).addBridge(commonUser);
    expect(await aclManager.isBridge(commonUser)).to.be.eq(true);
    for (const user of [
      newPoolAdmin,
      newAssetListingAdmin,
      bridge,
      newRiskAdmin,
      flashBorrowAdmin,
      flashBorrower,
      emergencyAdmin,
    ]) {
      await expect(
        aclManager.connect(user.signer).removeBridge(commonUser)
      ).to.be.revertedWith(
        `'AccessControl: account ${user.address.toLowerCase()} is missing role ${
          constants.HashZero
        }'`
      );
      expect(await aclManager.isBridge(commonUser)).to.be.eq(true);
    }
  });

  it("TC-ACLManager-41 only DEFAULT_ROLE_ADMIN can addAssetListingAdmin", async () => {
    const commonUser = await Wallet.createRandom().getAddress();
    const {
      aclManager,
      newPoolAdmin,
      newAssetListingAdmin,
      bridge,
      newRiskAdmin,
      flashBorrowAdmin,
      flashBorrower,
      emergencyAdmin,
    } = await loadFixture(fixtureWithRoles);
    for (const user of [
      newPoolAdmin,
      newAssetListingAdmin,
      bridge,
      newRiskAdmin,
      flashBorrowAdmin,
      flashBorrower,
      emergencyAdmin,
    ]) {
      await expect(
        aclManager.connect(user.signer).addAssetListingAdmin(commonUser)
      ).to.be.revertedWith(
        `'AccessControl: account ${user.address.toLowerCase()} is missing role ${
          constants.HashZero
        }'`
      );
      expect(await aclManager.isAssetListingAdmin(commonUser)).to.be.eq(false);
    }
  });

  it("TC-ACLManager-42 only DEFAULT_ROLE_ADMIN can removeAssetListingAdmin", async () => {
    const commonUser = await Wallet.createRandom().getAddress();
    const {
      aclManager,
      newPoolAdmin,
      newAssetListingAdmin,
      bridge,
      newRiskAdmin,
      flashBorrowAdmin,
      flashBorrower,
      emergencyAdmin,
      users,
    } = await loadFixture(fixtureWithRoles);
    await aclManager.connect(users[3].signer).addAssetListingAdmin(commonUser);
    expect(await aclManager.isAssetListingAdmin(commonUser)).to.be.eq(true);

    for (const user of [
      newPoolAdmin,
      newAssetListingAdmin,
      bridge,
      newRiskAdmin,
      flashBorrowAdmin,
      flashBorrower,
      emergencyAdmin,
    ]) {
      await expect(
        aclManager.connect(user.signer).removeAssetListingAdmin(commonUser)
      ).to.be.revertedWith(
        `'AccessControl: account ${user.address.toLowerCase()} is missing role ${
          constants.HashZero
        }'`
      );
      expect(await aclManager.isAssetListingAdmin(commonUser)).to.be.eq(true);
    }
  });
});
