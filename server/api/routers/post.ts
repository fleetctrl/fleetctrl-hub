import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";



// Mocked DB
interface Post {
  id: number;
  name: string;
}
const posts: Post[] = [
  {
    id: 1,
    name: "Hello World",
  },
];

export const postRouter = createTRPCRouter({
    getLatest: publicProcedure.query(() => {
    return posts.at(-1) ?? null;
  }),
});
