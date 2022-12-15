import {DRE} from "../../helpers/misc-utils";

class SnapshotManager {
  snapshots: {[id: string]: string} = {};

  async take(): Promise<string> {
    const id = await this.takeSnapshot();
    this.snapshots[id] = id;
    return id;
  }

  async revert(id: string): Promise<void> {
    await this.revertSnapshot(this.snapshots[id]);
    this.snapshots[id] = await this.takeSnapshot();
  }

  private async takeSnapshot(): Promise<string> {
    return (await DRE.network.provider.request({
      method: "evm_snapshot",
      params: [],
    })) as string;
  }

  private async revertSnapshot(id: string) {
    await DRE.network.provider.request({
      method: "evm_revert",
      params: [id],
    });
  }
}

export const snapshot = new SnapshotManager();
