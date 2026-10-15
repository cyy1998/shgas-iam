import type { DbClient } from "@iam/db";
import type { createAdminApiUnitOfWork } from "../index";

type AssertTrue<T extends true> = T;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Options = Parameters<typeof createAdminApiUnitOfWork>[0];
export type CompositionDatabaseOwnsTransaction = AssertTrue<Equal<Options["db"], DbClient>>;
