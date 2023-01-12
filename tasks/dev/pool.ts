import {task} from "hardhat/config";

task("list-facets", "List facets").setAction(async (_, DRE) => {
  await DRE.run("set-DRE");
  const {getPoolProxy} = await import("../../helpers/contracts-getters");
  const pool = await getPoolProxy();
  console.log(await pool.facets());
});

task("list-facet-addresses", "List facets addresses").setAction(
  async (_, DRE) => {
    await DRE.run("set-DRE");
    const {getPoolProxy} = await import("../../helpers/contracts-getters");
    const pool = await getPoolProxy();
    console.log(await pool.facetAddresses());
  }
);

task("facet-address", "Get facet address")
  .addPositionalParam("selector", "function selector")
  .setAction(async ({selector}, DRE) => {
    await DRE.run("set-DRE");
    const {getPoolProxy} = await import("../../helpers/contracts-getters");
    const pool = await getPoolProxy();
    console.log(await pool.facetAddress(selector));
  });

task("facet-function-selectors", "Get facet address")
  .addPositionalParam("facetAddress", "facet address")
  .setAction(async ({facetAddress}, DRE) => {
    await DRE.run("set-DRE");
    const {getPoolProxy} = await import("../../helpers/contracts-getters");
    const pool = await getPoolProxy();
    console.log(await pool.facetFunctionSelectors(facetAddress));
  });
