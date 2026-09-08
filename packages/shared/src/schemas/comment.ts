import { z } from "zod";

/** Comentário do casal num lançamento. */
export const createCommentBody = z.object({
  body: z.string().trim().min(1).max(2000),
});
export type CreateCommentBody = z.infer<typeof createCommentBody>;

export const updateCommentBody = createCommentBody;
export type UpdateCommentBody = z.infer<typeof updateCommentBody>;

export interface TransactionCommentDTO {
  id: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  author: {
    id: string;
    displayName: string;
    color: string;
    avatarUrl: string | null;
  };
}
