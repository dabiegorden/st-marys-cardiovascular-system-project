"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type { ActiveModel, Me } from "./types";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => api<{ user: Me }>("/me").then((r) => r.user),
    staleTime: 5 * 60_000,
  });
}

export function useActiveModel() {
  return useQuery({
    queryKey: ["model", "active"],
    queryFn: () => api<{ model: ActiveModel }>("/model/active").then((r) => r.model),
    staleTime: 5 * 60_000,
  });
}
