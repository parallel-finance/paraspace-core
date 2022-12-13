import type {AdapterSync} from "lowdb";
import {default as FileAdapter} from "lowdb/adapters/FileSync";

class MemoryAdapter {
  static state: any = {};
  read() {
    return MemoryAdapter.state;
  }
  write(_state: any) {
    MemoryAdapter.state = _state;
  }
}

export const getAdapter = (file: string): AdapterSync =>
  (file === ":memory:" ? new MemoryAdapter() : new FileAdapter(file)) as any;
