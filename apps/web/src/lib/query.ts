import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, err) => {
        if (err instanceof ApiError && [400, 401, 403, 404, 422].includes(err.status)) return false;
        return count < 2;
      },
      // volta a buscar ao reabrir o app (PWA) ou reconectar — respeita o staleTime,
      // então não fica atualizando à toa. O botão "Atualizar" no topo força tudo na hora.
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
});
