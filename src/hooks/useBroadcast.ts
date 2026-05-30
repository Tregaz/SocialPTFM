type BroadcastFn = (type: string, payload: unknown) => void;

let _broadcast: BroadcastFn | null = null;

export function setBroadcast(fn: BroadcastFn | null) {
  _broadcast = fn;
}

export function getBroadcast(): BroadcastFn | null {
  return _broadcast;
}