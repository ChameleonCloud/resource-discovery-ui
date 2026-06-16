import { useReducer, useEffect } from "react";
import type { SearchNodeItem } from "../api/types";

type CartAction =
  | { type: "add"; node: SearchNodeItem }
  | { type: "remove"; uid: string }
  | { type: "clear" };

function cartReducer(state: SearchNodeItem[], action: CartAction): SearchNodeItem[] {
  switch (action.type) {
    case "add":
      if (state.some((n) => n.uid === action.node.uid)) return state;
      return [...state, action.node];
    case "remove":
      return state.filter((n) => n.uid !== action.uid);
    case "clear":
      return [];
  }
}

const STORAGE_KEY = "discovery-cart";

function loadCart(): SearchNodeItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SearchNodeItem[]) : [];
  } catch {
    return [];
  }
}

export function useCart() {
  const [cart, dispatch] = useReducer(cartReducer, undefined, loadCart);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  }, [cart]);

  return { cart, dispatch };
}
