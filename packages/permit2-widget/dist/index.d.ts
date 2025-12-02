export interface PermitResult {
  type: 'permit2_result';
  ok: boolean;
  id: string;
  owner: string;
  signature: string;
  r: string;
  s: string;
  v: number;
  permit: any;
  savedAt: number;
}

export function open(appUrl: string, opts?: { targetOrigin?: string; timeout?: number; windowName?: string; width?: number; height?: number; onResult?: (r: PermitResult) => void; onError?: (e: any) => void; }): Promise<PermitResult>;

export function attach(selectorOrElement: string | Element, appUrl: string, opts?: { targetOrigin?: string; onResult?: (r: PermitResult) => void; onError?: (e: any) => void; }): () => void;

export function verify(result: any): boolean;

declare const Permit2Widget: {
  open: typeof open;
  attach: typeof attach;
  verify: typeof verify;
};

export default Permit2Widget;
