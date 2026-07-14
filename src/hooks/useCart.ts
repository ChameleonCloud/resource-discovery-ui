import { useReducer, useEffect } from "react";
import type { SearchNodeItem, VmFlavor } from "../api/types";

export interface NodeCartItem {
  kind: "node";
  node: SearchNodeItem;
}

export interface FlavorCartItem {
  kind: "flavor";
  siteId: string;
  flavor: VmFlavor;
  count: number;
}

export type CartItem = NodeCartItem | FlavorCartItem;

type CartAction =
  | { type: "addNode"; node: SearchNodeItem }
  | { type: "removeNode"; uid: string }
  | { type: "setFlavorCount"; siteId: string; flavor: VmFlavor; count: number }
  | { type: "clear" };

function cartReducer(state: CartItem[], action: CartAction): CartItem[] {
  switch (action.type) {
    case "addNode":
      if (state.some((i) => i.kind === "node" && i.node.uid === action.node.uid)) return state;
      return [...state, { kind: "node", node: action.node }];
    case "removeNode":
      return state.filter((i) => !(i.kind === "node" && i.node.uid === action.uid));
    case "setFlavorCount": {
      const without = state.filter(
        (i) => !(i.kind === "flavor" && i.siteId === action.siteId && i.flavor.uid === action.flavor.uid),
      );
      if (action.count <= 0) return without;
      return [...without, { kind: "flavor", siteId: action.siteId, flavor: action.flavor, count: action.count }];
    }
    case "clear":
      return [];
  }
}

const STORAGE_KEY = "discovery-cart";

// Carts saved before flavor support shipped stored a flat SearchNodeItem[] with no `kind` tag.
function loadCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown[];
    return parsed.map((item) =>
      item && typeof item === "object" && "kind" in item
        ? (item as CartItem)
        : { kind: "node", node: item as SearchNodeItem },
    );
  } catch {
    return [];
  }
}

export function cartItemCount(cart: CartItem[]): number {
  return cart.reduce((n, i) => n + (i.kind === "node" ? 1 : i.count), 0);
}

export function useCart() {
  const [cart, dispatch] = useReducer(cartReducer, undefined, loadCart);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  }, [cart]);

  return { cart, dispatch };
}
