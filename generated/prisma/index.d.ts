
/**
 * Client
**/

import * as runtime from './runtime/library.js';
import $Types = runtime.Types // general types
import $Public = runtime.Types.Public
import $Utils = runtime.Types.Utils
import $Extensions = runtime.Types.Extensions
import $Result = runtime.Types.Result

export type PrismaPromise<T> = $Public.PrismaPromise<T>


/**
 * Model User
 * 
 */
export type User = $Result.DefaultSelection<Prisma.$UserPayload>
/**
 * Model Organization
 * 
 */
export type Organization = $Result.DefaultSelection<Prisma.$OrganizationPayload>
/**
 * Model Position
 * 
 */
export type Position = $Result.DefaultSelection<Prisma.$PositionPayload>
/**
 * Model Employment
 * 
 */
export type Employment = $Result.DefaultSelection<Prisma.$EmploymentPayload>
/**
 * Model Client
 * 
 */
export type Client = $Result.DefaultSelection<Prisma.$ClientPayload>
/**
 * Model Role
 * 
 */
export type Role = $Result.DefaultSelection<Prisma.$RolePayload>
/**
 * Model PositionRole
 * 
 */
export type PositionRole = $Result.DefaultSelection<Prisma.$PositionRolePayload>
/**
 * Model EmploymentRole
 * 
 */
export type EmploymentRole = $Result.DefaultSelection<Prisma.$EmploymentRolePayload>
/**
 * Model OrganizationRole
 * 
 */
export type OrganizationRole = $Result.DefaultSelection<Prisma.$OrganizationRolePayload>
/**
 * Model AuthObject
 * 
 */
export type AuthObject = $Result.DefaultSelection<Prisma.$AuthObjectPayload>
/**
 * Model Privilege
 * 
 */
export type Privilege = $Result.DefaultSelection<Prisma.$PrivilegePayload>
/**
 * Model PrivilegeDelegation
 * 
 */
export type PrivilegeDelegation = $Result.DefaultSelection<Prisma.$PrivilegeDelegationPayload>
/**
 * Model DelegationDetail
 * 
 */
export type DelegationDetail = $Result.DefaultSelection<Prisma.$DelegationDetailPayload>
/**
 * Model RolePrivilege
 * 
 */
export type RolePrivilege = $Result.DefaultSelection<Prisma.$RolePrivilegePayload>

/**
 * ##  Prisma Client ʲˢ
 *
 * Type-safe database client for TypeScript & Node.js
 * @example
 * ```
 * const prisma = new PrismaClient()
 * // Fetch zero or more Users
 * const users = await prisma.user.findMany()
 * ```
 *
 *
 * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
 */
export class PrismaClient<
  ClientOptions extends Prisma.PrismaClientOptions = Prisma.PrismaClientOptions,
  const U = 'log' extends keyof ClientOptions ? ClientOptions['log'] extends Array<Prisma.LogLevel | Prisma.LogDefinition> ? Prisma.GetEvents<ClientOptions['log']> : never : never,
  ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs
> {
  [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['other'] }

    /**
   * ##  Prisma Client ʲˢ
   *
   * Type-safe database client for TypeScript & Node.js
   * @example
   * ```
   * const prisma = new PrismaClient()
   * // Fetch zero or more Users
   * const users = await prisma.user.findMany()
   * ```
   *
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
   */

  constructor(optionsArg ?: Prisma.Subset<ClientOptions, Prisma.PrismaClientOptions>);
  $on<V extends U>(eventType: V, callback: (event: V extends 'query' ? Prisma.QueryEvent : Prisma.LogEvent) => void): PrismaClient;

  /**
   * Connect with the database
   */
  $connect(): $Utils.JsPromise<void>;

  /**
   * Disconnect from the database
   */
  $disconnect(): $Utils.JsPromise<void>;

/**
   * Executes a prepared raw query and returns the number of affected rows.
   * @example
   * ```
   * const result = await prisma.$executeRaw`UPDATE User SET cool = ${true} WHERE email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Executes a raw query and returns the number of affected rows.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$executeRawUnsafe('UPDATE User SET cool = $1 WHERE email = $2 ;', true, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Performs a prepared raw query and returns the `SELECT` data.
   * @example
   * ```
   * const result = await prisma.$queryRaw`SELECT * FROM User WHERE id = ${1} OR email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<T>;

  /**
   * Performs a raw query and returns the `SELECT` data.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$queryRawUnsafe('SELECT * FROM User WHERE id = $1 OR email = $2;', 1, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<T>;


  /**
   * Allows the running of a sequence of read/write operations that are guaranteed to either succeed or fail as a whole.
   * @example
   * ```
   * const [george, bob, alice] = await prisma.$transaction([
   *   prisma.user.create({ data: { name: 'George' } }),
   *   prisma.user.create({ data: { name: 'Bob' } }),
   *   prisma.user.create({ data: { name: 'Alice' } }),
   * ])
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/concepts/components/prisma-client/transactions).
   */
  $transaction<P extends Prisma.PrismaPromise<any>[]>(arg: [...P], options?: { isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<runtime.Types.Utils.UnwrapTuple<P>>

  $transaction<R>(fn: (prisma: Omit<PrismaClient, runtime.ITXClientDenyList>) => $Utils.JsPromise<R>, options?: { maxWait?: number, timeout?: number, isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<R>


  $extends: $Extensions.ExtendsHook<"extends", Prisma.TypeMapCb<ClientOptions>, ExtArgs, $Utils.Call<Prisma.TypeMapCb<ClientOptions>, {
    extArgs: ExtArgs
  }>>

      /**
   * `prisma.user`: Exposes CRUD operations for the **User** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Users
    * const users = await prisma.user.findMany()
    * ```
    */
  get user(): Prisma.UserDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.organization`: Exposes CRUD operations for the **Organization** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Organizations
    * const organizations = await prisma.organization.findMany()
    * ```
    */
  get organization(): Prisma.OrganizationDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.position`: Exposes CRUD operations for the **Position** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Positions
    * const positions = await prisma.position.findMany()
    * ```
    */
  get position(): Prisma.PositionDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.employment`: Exposes CRUD operations for the **Employment** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Employments
    * const employments = await prisma.employment.findMany()
    * ```
    */
  get employment(): Prisma.EmploymentDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.client`: Exposes CRUD operations for the **Client** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Clients
    * const clients = await prisma.client.findMany()
    * ```
    */
  get client(): Prisma.ClientDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.role`: Exposes CRUD operations for the **Role** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Roles
    * const roles = await prisma.role.findMany()
    * ```
    */
  get role(): Prisma.RoleDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.positionRole`: Exposes CRUD operations for the **PositionRole** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more PositionRoles
    * const positionRoles = await prisma.positionRole.findMany()
    * ```
    */
  get positionRole(): Prisma.PositionRoleDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.employmentRole`: Exposes CRUD operations for the **EmploymentRole** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more EmploymentRoles
    * const employmentRoles = await prisma.employmentRole.findMany()
    * ```
    */
  get employmentRole(): Prisma.EmploymentRoleDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.organizationRole`: Exposes CRUD operations for the **OrganizationRole** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more OrganizationRoles
    * const organizationRoles = await prisma.organizationRole.findMany()
    * ```
    */
  get organizationRole(): Prisma.OrganizationRoleDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.authObject`: Exposes CRUD operations for the **AuthObject** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more AuthObjects
    * const authObjects = await prisma.authObject.findMany()
    * ```
    */
  get authObject(): Prisma.AuthObjectDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.privilege`: Exposes CRUD operations for the **Privilege** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Privileges
    * const privileges = await prisma.privilege.findMany()
    * ```
    */
  get privilege(): Prisma.PrivilegeDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.privilegeDelegation`: Exposes CRUD operations for the **PrivilegeDelegation** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more PrivilegeDelegations
    * const privilegeDelegations = await prisma.privilegeDelegation.findMany()
    * ```
    */
  get privilegeDelegation(): Prisma.PrivilegeDelegationDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.delegationDetail`: Exposes CRUD operations for the **DelegationDetail** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more DelegationDetails
    * const delegationDetails = await prisma.delegationDetail.findMany()
    * ```
    */
  get delegationDetail(): Prisma.DelegationDetailDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.rolePrivilege`: Exposes CRUD operations for the **RolePrivilege** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more RolePrivileges
    * const rolePrivileges = await prisma.rolePrivilege.findMany()
    * ```
    */
  get rolePrivilege(): Prisma.RolePrivilegeDelegate<ExtArgs, ClientOptions>;
}

export namespace Prisma {
  export import DMMF = runtime.DMMF

  export type PrismaPromise<T> = $Public.PrismaPromise<T>

  /**
   * Validator
   */
  export import validator = runtime.Public.validator

  /**
   * Prisma Errors
   */
  export import PrismaClientKnownRequestError = runtime.PrismaClientKnownRequestError
  export import PrismaClientUnknownRequestError = runtime.PrismaClientUnknownRequestError
  export import PrismaClientRustPanicError = runtime.PrismaClientRustPanicError
  export import PrismaClientInitializationError = runtime.PrismaClientInitializationError
  export import PrismaClientValidationError = runtime.PrismaClientValidationError

  /**
   * Re-export of sql-template-tag
   */
  export import sql = runtime.sqltag
  export import empty = runtime.empty
  export import join = runtime.join
  export import raw = runtime.raw
  export import Sql = runtime.Sql



  /**
   * Decimal.js
   */
  export import Decimal = runtime.Decimal

  export type DecimalJsLike = runtime.DecimalJsLike

  /**
   * Metrics
   */
  export type Metrics = runtime.Metrics
  export type Metric<T> = runtime.Metric<T>
  export type MetricHistogram = runtime.MetricHistogram
  export type MetricHistogramBucket = runtime.MetricHistogramBucket

  /**
  * Extensions
  */
  export import Extension = $Extensions.UserArgs
  export import getExtensionContext = runtime.Extensions.getExtensionContext
  export import Args = $Public.Args
  export import Payload = $Public.Payload
  export import Result = $Public.Result
  export import Exact = $Public.Exact

  /**
   * Prisma Client JS version: 6.17.1
   * Query Engine version: 272a37d34178c2894197e17273bf937f25acdeac
   */
  export type PrismaVersion = {
    client: string
  }

  export const prismaVersion: PrismaVersion

  /**
   * Utility Types
   */


  export import JsonObject = runtime.JsonObject
  export import JsonArray = runtime.JsonArray
  export import JsonValue = runtime.JsonValue
  export import InputJsonObject = runtime.InputJsonObject
  export import InputJsonArray = runtime.InputJsonArray
  export import InputJsonValue = runtime.InputJsonValue

  /**
   * Types of the values used to represent different kinds of `null` values when working with JSON fields.
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  namespace NullTypes {
    /**
    * Type of `Prisma.DbNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.DbNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class DbNull {
      private DbNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.JsonNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.JsonNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class JsonNull {
      private JsonNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.AnyNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.AnyNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class AnyNull {
      private AnyNull: never
      private constructor()
    }
  }

  /**
   * Helper for filtering JSON entries that have `null` on the database (empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const DbNull: NullTypes.DbNull

  /**
   * Helper for filtering JSON entries that have JSON `null` values (not empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const JsonNull: NullTypes.JsonNull

  /**
   * Helper for filtering JSON entries that are `Prisma.DbNull` or `Prisma.JsonNull`
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const AnyNull: NullTypes.AnyNull

  type SelectAndInclude = {
    select: any
    include: any
  }

  type SelectAndOmit = {
    select: any
    omit: any
  }

  /**
   * Get the type of the value, that the Promise holds.
   */
  export type PromiseType<T extends PromiseLike<any>> = T extends PromiseLike<infer U> ? U : T;

  /**
   * Get the return type of a function which returns a Promise.
   */
  export type PromiseReturnType<T extends (...args: any) => $Utils.JsPromise<any>> = PromiseType<ReturnType<T>>

  /**
   * From T, pick a set of properties whose keys are in the union K
   */
  type Prisma__Pick<T, K extends keyof T> = {
      [P in K]: T[P];
  };


  export type Enumerable<T> = T | Array<T>;

  export type RequiredKeys<T> = {
    [K in keyof T]-?: {} extends Prisma__Pick<T, K> ? never : K
  }[keyof T]

  export type TruthyKeys<T> = keyof {
    [K in keyof T as T[K] extends false | undefined | null ? never : K]: K
  }

  export type TrueKeys<T> = TruthyKeys<Prisma__Pick<T, RequiredKeys<T>>>

  /**
   * Subset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection
   */
  export type Subset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never;
  };

  /**
   * SelectSubset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection.
   * Additionally, it validates, if both select and include are present. If the case, it errors.
   */
  export type SelectSubset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    (T extends SelectAndInclude
      ? 'Please either choose `select` or `include`.'
      : T extends SelectAndOmit
        ? 'Please either choose `select` or `omit`.'
        : {})

  /**
   * Subset + Intersection
   * @desc From `T` pick properties that exist in `U` and intersect `K`
   */
  export type SubsetIntersection<T, U, K> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    K

  type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };

  /**
   * XOR is needed to have a real mutually exclusive union type
   * https://stackoverflow.com/questions/42123407/does-typescript-support-mutually-exclusive-types
   */
  type XOR<T, U> =
    T extends object ?
    U extends object ?
      (Without<T, U> & U) | (Without<U, T> & T)
    : U : T


  /**
   * Is T a Record?
   */
  type IsObject<T extends any> = T extends Array<any>
  ? False
  : T extends Date
  ? False
  : T extends Uint8Array
  ? False
  : T extends BigInt
  ? False
  : T extends object
  ? True
  : False


  /**
   * If it's T[], return T
   */
  export type UnEnumerate<T extends unknown> = T extends Array<infer U> ? U : T

  /**
   * From ts-toolbelt
   */

  type __Either<O extends object, K extends Key> = Omit<O, K> &
    {
      // Merge all but K
      [P in K]: Prisma__Pick<O, P & keyof O> // With K possibilities
    }[K]

  type EitherStrict<O extends object, K extends Key> = Strict<__Either<O, K>>

  type EitherLoose<O extends object, K extends Key> = ComputeRaw<__Either<O, K>>

  type _Either<
    O extends object,
    K extends Key,
    strict extends Boolean
  > = {
    1: EitherStrict<O, K>
    0: EitherLoose<O, K>
  }[strict]

  type Either<
    O extends object,
    K extends Key,
    strict extends Boolean = 1
  > = O extends unknown ? _Either<O, K, strict> : never

  export type Union = any

  type PatchUndefined<O extends object, O1 extends object> = {
    [K in keyof O]: O[K] extends undefined ? At<O1, K> : O[K]
  } & {}

  /** Helper Types for "Merge" **/
  export type IntersectOf<U extends Union> = (
    U extends unknown ? (k: U) => void : never
  ) extends (k: infer I) => void
    ? I
    : never

  export type Overwrite<O extends object, O1 extends object> = {
      [K in keyof O]: K extends keyof O1 ? O1[K] : O[K];
  } & {};

  type _Merge<U extends object> = IntersectOf<Overwrite<U, {
      [K in keyof U]-?: At<U, K>;
  }>>;

  type Key = string | number | symbol;
  type AtBasic<O extends object, K extends Key> = K extends keyof O ? O[K] : never;
  type AtStrict<O extends object, K extends Key> = O[K & keyof O];
  type AtLoose<O extends object, K extends Key> = O extends unknown ? AtStrict<O, K> : never;
  export type At<O extends object, K extends Key, strict extends Boolean = 1> = {
      1: AtStrict<O, K>;
      0: AtLoose<O, K>;
  }[strict];

  export type ComputeRaw<A extends any> = A extends Function ? A : {
    [K in keyof A]: A[K];
  } & {};

  export type OptionalFlat<O> = {
    [K in keyof O]?: O[K];
  } & {};

  type _Record<K extends keyof any, T> = {
    [P in K]: T;
  };

  // cause typescript not to expand types and preserve names
  type NoExpand<T> = T extends unknown ? T : never;

  // this type assumes the passed object is entirely optional
  type AtLeast<O extends object, K extends string> = NoExpand<
    O extends unknown
    ? | (K extends keyof O ? { [P in K]: O[P] } & O : O)
      | {[P in keyof O as P extends K ? P : never]-?: O[P]} & O
    : never>;

  type _Strict<U, _U = U> = U extends unknown ? U & OptionalFlat<_Record<Exclude<Keys<_U>, keyof U>, never>> : never;

  export type Strict<U extends object> = ComputeRaw<_Strict<U>>;
  /** End Helper Types for "Merge" **/

  export type Merge<U extends object> = ComputeRaw<_Merge<Strict<U>>>;

  /**
  A [[Boolean]]
  */
  export type Boolean = True | False

  // /**
  // 1
  // */
  export type True = 1

  /**
  0
  */
  export type False = 0

  export type Not<B extends Boolean> = {
    0: 1
    1: 0
  }[B]

  export type Extends<A1 extends any, A2 extends any> = [A1] extends [never]
    ? 0 // anything `never` is false
    : A1 extends A2
    ? 1
    : 0

  export type Has<U extends Union, U1 extends Union> = Not<
    Extends<Exclude<U1, U>, U1>
  >

  export type Or<B1 extends Boolean, B2 extends Boolean> = {
    0: {
      0: 0
      1: 1
    }
    1: {
      0: 1
      1: 1
    }
  }[B1][B2]

  export type Keys<U extends Union> = U extends unknown ? keyof U : never

  type Cast<A, B> = A extends B ? A : B;

  export const type: unique symbol;



  /**
   * Used by group by
   */

  export type GetScalarType<T, O> = O extends object ? {
    [P in keyof T]: P extends keyof O
      ? O[P]
      : never
  } : never

  type FieldPaths<
    T,
    U = Omit<T, '_avg' | '_sum' | '_count' | '_min' | '_max'>
  > = IsObject<T> extends True ? U : T

  type GetHavingFields<T> = {
    [K in keyof T]: Or<
      Or<Extends<'OR', K>, Extends<'AND', K>>,
      Extends<'NOT', K>
    > extends True
      ? // infer is only needed to not hit TS limit
        // based on the brilliant idea of Pierre-Antoine Mills
        // https://github.com/microsoft/TypeScript/issues/30188#issuecomment-478938437
        T[K] extends infer TK
        ? GetHavingFields<UnEnumerate<TK> extends object ? Merge<UnEnumerate<TK>> : never>
        : never
      : {} extends FieldPaths<T[K]>
      ? never
      : K
  }[keyof T]

  /**
   * Convert tuple to union
   */
  type _TupleToUnion<T> = T extends (infer E)[] ? E : never
  type TupleToUnion<K extends readonly any[]> = _TupleToUnion<K>
  type MaybeTupleToUnion<T> = T extends any[] ? TupleToUnion<T> : T

  /**
   * Like `Pick`, but additionally can also accept an array of keys
   */
  type PickEnumerable<T, K extends Enumerable<keyof T> | keyof T> = Prisma__Pick<T, MaybeTupleToUnion<K>>

  /**
   * Exclude all keys with underscores
   */
  type ExcludeUnderscoreKeys<T extends string> = T extends `_${string}` ? never : T


  export type FieldRef<Model, FieldType> = runtime.FieldRef<Model, FieldType>

  type FieldRefInputType<Model, FieldType> = Model extends never ? never : FieldRef<Model, FieldType>


  export const ModelName: {
    User: 'User',
    Organization: 'Organization',
    Position: 'Position',
    Employment: 'Employment',
    Client: 'Client',
    Role: 'Role',
    PositionRole: 'PositionRole',
    EmploymentRole: 'EmploymentRole',
    OrganizationRole: 'OrganizationRole',
    AuthObject: 'AuthObject',
    Privilege: 'Privilege',
    PrivilegeDelegation: 'PrivilegeDelegation',
    DelegationDetail: 'DelegationDetail',
    RolePrivilege: 'RolePrivilege'
  };

  export type ModelName = (typeof ModelName)[keyof typeof ModelName]


  export type Datasources = {
    db?: Datasource
  }

  interface TypeMapCb<ClientOptions = {}> extends $Utils.Fn<{extArgs: $Extensions.InternalArgs }, $Utils.Record<string, any>> {
    returns: Prisma.TypeMap<this['params']['extArgs'], ClientOptions extends { omit: infer OmitOptions } ? OmitOptions : {}>
  }

  export type TypeMap<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> = {
    globalOmitOptions: {
      omit: GlobalOmitOptions
    }
    meta: {
      modelProps: "user" | "organization" | "position" | "employment" | "client" | "role" | "positionRole" | "employmentRole" | "organizationRole" | "authObject" | "privilege" | "privilegeDelegation" | "delegationDetail" | "rolePrivilege"
      txIsolationLevel: Prisma.TransactionIsolationLevel
    }
    model: {
      User: {
        payload: Prisma.$UserPayload<ExtArgs>
        fields: Prisma.UserFieldRefs
        operations: {
          findUnique: {
            args: Prisma.UserFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.UserFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          findFirst: {
            args: Prisma.UserFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.UserFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          findMany: {
            args: Prisma.UserFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>[]
          }
          create: {
            args: Prisma.UserCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          createMany: {
            args: Prisma.UserCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          delete: {
            args: Prisma.UserDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          update: {
            args: Prisma.UserUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          deleteMany: {
            args: Prisma.UserDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.UserUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.UserUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$UserPayload>
          }
          aggregate: {
            args: Prisma.UserAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateUser>
          }
          groupBy: {
            args: Prisma.UserGroupByArgs<ExtArgs>
            result: $Utils.Optional<UserGroupByOutputType>[]
          }
          count: {
            args: Prisma.UserCountArgs<ExtArgs>
            result: $Utils.Optional<UserCountAggregateOutputType> | number
          }
        }
      }
      Organization: {
        payload: Prisma.$OrganizationPayload<ExtArgs>
        fields: Prisma.OrganizationFieldRefs
        operations: {
          findUnique: {
            args: Prisma.OrganizationFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OrganizationPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.OrganizationFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OrganizationPayload>
          }
          findFirst: {
            args: Prisma.OrganizationFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OrganizationPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.OrganizationFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OrganizationPayload>
          }
          findMany: {
            args: Prisma.OrganizationFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OrganizationPayload>[]
          }
          create: {
            args: Prisma.OrganizationCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OrganizationPayload>
          }
          createMany: {
            args: Prisma.OrganizationCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          delete: {
            args: Prisma.OrganizationDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OrganizationPayload>
          }
          update: {
            args: Prisma.OrganizationUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OrganizationPayload>
          }
          deleteMany: {
            args: Prisma.OrganizationDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.OrganizationUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.OrganizationUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OrganizationPayload>
          }
          aggregate: {
            args: Prisma.OrganizationAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateOrganization>
          }
          groupBy: {
            args: Prisma.OrganizationGroupByArgs<ExtArgs>
            result: $Utils.Optional<OrganizationGroupByOutputType>[]
          }
          count: {
            args: Prisma.OrganizationCountArgs<ExtArgs>
            result: $Utils.Optional<OrganizationCountAggregateOutputType> | number
          }
        }
      }
      Position: {
        payload: Prisma.$PositionPayload<ExtArgs>
        fields: Prisma.PositionFieldRefs
        operations: {
          findUnique: {
            args: Prisma.PositionFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PositionPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.PositionFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PositionPayload>
          }
          findFirst: {
            args: Prisma.PositionFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PositionPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.PositionFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PositionPayload>
          }
          findMany: {
            args: Prisma.PositionFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PositionPayload>[]
          }
          create: {
            args: Prisma.PositionCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PositionPayload>
          }
          createMany: {
            args: Prisma.PositionCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          delete: {
            args: Prisma.PositionDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PositionPayload>
          }
          update: {
            args: Prisma.PositionUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PositionPayload>
          }
          deleteMany: {
            args: Prisma.PositionDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.PositionUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.PositionUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PositionPayload>
          }
          aggregate: {
            args: Prisma.PositionAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregatePosition>
          }
          groupBy: {
            args: Prisma.PositionGroupByArgs<ExtArgs>
            result: $Utils.Optional<PositionGroupByOutputType>[]
          }
          count: {
            args: Prisma.PositionCountArgs<ExtArgs>
            result: $Utils.Optional<PositionCountAggregateOutputType> | number
          }
        }
      }
      Employment: {
        payload: Prisma.$EmploymentPayload<ExtArgs>
        fields: Prisma.EmploymentFieldRefs
        operations: {
          findUnique: {
            args: Prisma.EmploymentFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EmploymentPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.EmploymentFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EmploymentPayload>
          }
          findFirst: {
            args: Prisma.EmploymentFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EmploymentPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.EmploymentFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EmploymentPayload>
          }
          findMany: {
            args: Prisma.EmploymentFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EmploymentPayload>[]
          }
          create: {
            args: Prisma.EmploymentCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EmploymentPayload>
          }
          createMany: {
            args: Prisma.EmploymentCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          delete: {
            args: Prisma.EmploymentDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EmploymentPayload>
          }
          update: {
            args: Prisma.EmploymentUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EmploymentPayload>
          }
          deleteMany: {
            args: Prisma.EmploymentDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.EmploymentUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.EmploymentUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EmploymentPayload>
          }
          aggregate: {
            args: Prisma.EmploymentAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateEmployment>
          }
          groupBy: {
            args: Prisma.EmploymentGroupByArgs<ExtArgs>
            result: $Utils.Optional<EmploymentGroupByOutputType>[]
          }
          count: {
            args: Prisma.EmploymentCountArgs<ExtArgs>
            result: $Utils.Optional<EmploymentCountAggregateOutputType> | number
          }
        }
      }
      Client: {
        payload: Prisma.$ClientPayload<ExtArgs>
        fields: Prisma.ClientFieldRefs
        operations: {
          findUnique: {
            args: Prisma.ClientFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ClientPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.ClientFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ClientPayload>
          }
          findFirst: {
            args: Prisma.ClientFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ClientPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.ClientFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ClientPayload>
          }
          findMany: {
            args: Prisma.ClientFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ClientPayload>[]
          }
          create: {
            args: Prisma.ClientCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ClientPayload>
          }
          createMany: {
            args: Prisma.ClientCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          delete: {
            args: Prisma.ClientDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ClientPayload>
          }
          update: {
            args: Prisma.ClientUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ClientPayload>
          }
          deleteMany: {
            args: Prisma.ClientDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.ClientUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.ClientUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ClientPayload>
          }
          aggregate: {
            args: Prisma.ClientAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateClient>
          }
          groupBy: {
            args: Prisma.ClientGroupByArgs<ExtArgs>
            result: $Utils.Optional<ClientGroupByOutputType>[]
          }
          count: {
            args: Prisma.ClientCountArgs<ExtArgs>
            result: $Utils.Optional<ClientCountAggregateOutputType> | number
          }
        }
      }
      Role: {
        payload: Prisma.$RolePayload<ExtArgs>
        fields: Prisma.RoleFieldRefs
        operations: {
          findUnique: {
            args: Prisma.RoleFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.RoleFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePayload>
          }
          findFirst: {
            args: Prisma.RoleFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.RoleFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePayload>
          }
          findMany: {
            args: Prisma.RoleFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePayload>[]
          }
          create: {
            args: Prisma.RoleCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePayload>
          }
          createMany: {
            args: Prisma.RoleCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          delete: {
            args: Prisma.RoleDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePayload>
          }
          update: {
            args: Prisma.RoleUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePayload>
          }
          deleteMany: {
            args: Prisma.RoleDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.RoleUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.RoleUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePayload>
          }
          aggregate: {
            args: Prisma.RoleAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateRole>
          }
          groupBy: {
            args: Prisma.RoleGroupByArgs<ExtArgs>
            result: $Utils.Optional<RoleGroupByOutputType>[]
          }
          count: {
            args: Prisma.RoleCountArgs<ExtArgs>
            result: $Utils.Optional<RoleCountAggregateOutputType> | number
          }
        }
      }
      PositionRole: {
        payload: Prisma.$PositionRolePayload<ExtArgs>
        fields: Prisma.PositionRoleFieldRefs
        operations: {
          findUnique: {
            args: Prisma.PositionRoleFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PositionRolePayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.PositionRoleFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PositionRolePayload>
          }
          findFirst: {
            args: Prisma.PositionRoleFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PositionRolePayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.PositionRoleFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PositionRolePayload>
          }
          findMany: {
            args: Prisma.PositionRoleFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PositionRolePayload>[]
          }
          create: {
            args: Prisma.PositionRoleCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PositionRolePayload>
          }
          createMany: {
            args: Prisma.PositionRoleCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          delete: {
            args: Prisma.PositionRoleDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PositionRolePayload>
          }
          update: {
            args: Prisma.PositionRoleUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PositionRolePayload>
          }
          deleteMany: {
            args: Prisma.PositionRoleDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.PositionRoleUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.PositionRoleUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PositionRolePayload>
          }
          aggregate: {
            args: Prisma.PositionRoleAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregatePositionRole>
          }
          groupBy: {
            args: Prisma.PositionRoleGroupByArgs<ExtArgs>
            result: $Utils.Optional<PositionRoleGroupByOutputType>[]
          }
          count: {
            args: Prisma.PositionRoleCountArgs<ExtArgs>
            result: $Utils.Optional<PositionRoleCountAggregateOutputType> | number
          }
        }
      }
      EmploymentRole: {
        payload: Prisma.$EmploymentRolePayload<ExtArgs>
        fields: Prisma.EmploymentRoleFieldRefs
        operations: {
          findUnique: {
            args: Prisma.EmploymentRoleFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EmploymentRolePayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.EmploymentRoleFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EmploymentRolePayload>
          }
          findFirst: {
            args: Prisma.EmploymentRoleFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EmploymentRolePayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.EmploymentRoleFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EmploymentRolePayload>
          }
          findMany: {
            args: Prisma.EmploymentRoleFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EmploymentRolePayload>[]
          }
          create: {
            args: Prisma.EmploymentRoleCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EmploymentRolePayload>
          }
          createMany: {
            args: Prisma.EmploymentRoleCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          delete: {
            args: Prisma.EmploymentRoleDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EmploymentRolePayload>
          }
          update: {
            args: Prisma.EmploymentRoleUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EmploymentRolePayload>
          }
          deleteMany: {
            args: Prisma.EmploymentRoleDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.EmploymentRoleUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.EmploymentRoleUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$EmploymentRolePayload>
          }
          aggregate: {
            args: Prisma.EmploymentRoleAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateEmploymentRole>
          }
          groupBy: {
            args: Prisma.EmploymentRoleGroupByArgs<ExtArgs>
            result: $Utils.Optional<EmploymentRoleGroupByOutputType>[]
          }
          count: {
            args: Prisma.EmploymentRoleCountArgs<ExtArgs>
            result: $Utils.Optional<EmploymentRoleCountAggregateOutputType> | number
          }
        }
      }
      OrganizationRole: {
        payload: Prisma.$OrganizationRolePayload<ExtArgs>
        fields: Prisma.OrganizationRoleFieldRefs
        operations: {
          findUnique: {
            args: Prisma.OrganizationRoleFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OrganizationRolePayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.OrganizationRoleFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OrganizationRolePayload>
          }
          findFirst: {
            args: Prisma.OrganizationRoleFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OrganizationRolePayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.OrganizationRoleFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OrganizationRolePayload>
          }
          findMany: {
            args: Prisma.OrganizationRoleFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OrganizationRolePayload>[]
          }
          create: {
            args: Prisma.OrganizationRoleCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OrganizationRolePayload>
          }
          createMany: {
            args: Prisma.OrganizationRoleCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          delete: {
            args: Prisma.OrganizationRoleDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OrganizationRolePayload>
          }
          update: {
            args: Prisma.OrganizationRoleUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OrganizationRolePayload>
          }
          deleteMany: {
            args: Prisma.OrganizationRoleDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.OrganizationRoleUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.OrganizationRoleUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$OrganizationRolePayload>
          }
          aggregate: {
            args: Prisma.OrganizationRoleAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateOrganizationRole>
          }
          groupBy: {
            args: Prisma.OrganizationRoleGroupByArgs<ExtArgs>
            result: $Utils.Optional<OrganizationRoleGroupByOutputType>[]
          }
          count: {
            args: Prisma.OrganizationRoleCountArgs<ExtArgs>
            result: $Utils.Optional<OrganizationRoleCountAggregateOutputType> | number
          }
        }
      }
      AuthObject: {
        payload: Prisma.$AuthObjectPayload<ExtArgs>
        fields: Prisma.AuthObjectFieldRefs
        operations: {
          findUnique: {
            args: Prisma.AuthObjectFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuthObjectPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.AuthObjectFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuthObjectPayload>
          }
          findFirst: {
            args: Prisma.AuthObjectFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuthObjectPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.AuthObjectFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuthObjectPayload>
          }
          findMany: {
            args: Prisma.AuthObjectFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuthObjectPayload>[]
          }
          create: {
            args: Prisma.AuthObjectCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuthObjectPayload>
          }
          createMany: {
            args: Prisma.AuthObjectCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          delete: {
            args: Prisma.AuthObjectDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuthObjectPayload>
          }
          update: {
            args: Prisma.AuthObjectUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuthObjectPayload>
          }
          deleteMany: {
            args: Prisma.AuthObjectDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.AuthObjectUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.AuthObjectUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$AuthObjectPayload>
          }
          aggregate: {
            args: Prisma.AuthObjectAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateAuthObject>
          }
          groupBy: {
            args: Prisma.AuthObjectGroupByArgs<ExtArgs>
            result: $Utils.Optional<AuthObjectGroupByOutputType>[]
          }
          count: {
            args: Prisma.AuthObjectCountArgs<ExtArgs>
            result: $Utils.Optional<AuthObjectCountAggregateOutputType> | number
          }
        }
      }
      Privilege: {
        payload: Prisma.$PrivilegePayload<ExtArgs>
        fields: Prisma.PrivilegeFieldRefs
        operations: {
          findUnique: {
            args: Prisma.PrivilegeFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PrivilegePayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.PrivilegeFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PrivilegePayload>
          }
          findFirst: {
            args: Prisma.PrivilegeFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PrivilegePayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.PrivilegeFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PrivilegePayload>
          }
          findMany: {
            args: Prisma.PrivilegeFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PrivilegePayload>[]
          }
          create: {
            args: Prisma.PrivilegeCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PrivilegePayload>
          }
          createMany: {
            args: Prisma.PrivilegeCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          delete: {
            args: Prisma.PrivilegeDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PrivilegePayload>
          }
          update: {
            args: Prisma.PrivilegeUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PrivilegePayload>
          }
          deleteMany: {
            args: Prisma.PrivilegeDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.PrivilegeUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.PrivilegeUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PrivilegePayload>
          }
          aggregate: {
            args: Prisma.PrivilegeAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregatePrivilege>
          }
          groupBy: {
            args: Prisma.PrivilegeGroupByArgs<ExtArgs>
            result: $Utils.Optional<PrivilegeGroupByOutputType>[]
          }
          count: {
            args: Prisma.PrivilegeCountArgs<ExtArgs>
            result: $Utils.Optional<PrivilegeCountAggregateOutputType> | number
          }
        }
      }
      PrivilegeDelegation: {
        payload: Prisma.$PrivilegeDelegationPayload<ExtArgs>
        fields: Prisma.PrivilegeDelegationFieldRefs
        operations: {
          findUnique: {
            args: Prisma.PrivilegeDelegationFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PrivilegeDelegationPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.PrivilegeDelegationFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PrivilegeDelegationPayload>
          }
          findFirst: {
            args: Prisma.PrivilegeDelegationFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PrivilegeDelegationPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.PrivilegeDelegationFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PrivilegeDelegationPayload>
          }
          findMany: {
            args: Prisma.PrivilegeDelegationFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PrivilegeDelegationPayload>[]
          }
          create: {
            args: Prisma.PrivilegeDelegationCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PrivilegeDelegationPayload>
          }
          createMany: {
            args: Prisma.PrivilegeDelegationCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          delete: {
            args: Prisma.PrivilegeDelegationDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PrivilegeDelegationPayload>
          }
          update: {
            args: Prisma.PrivilegeDelegationUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PrivilegeDelegationPayload>
          }
          deleteMany: {
            args: Prisma.PrivilegeDelegationDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.PrivilegeDelegationUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.PrivilegeDelegationUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$PrivilegeDelegationPayload>
          }
          aggregate: {
            args: Prisma.PrivilegeDelegationAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregatePrivilegeDelegation>
          }
          groupBy: {
            args: Prisma.PrivilegeDelegationGroupByArgs<ExtArgs>
            result: $Utils.Optional<PrivilegeDelegationGroupByOutputType>[]
          }
          count: {
            args: Prisma.PrivilegeDelegationCountArgs<ExtArgs>
            result: $Utils.Optional<PrivilegeDelegationCountAggregateOutputType> | number
          }
        }
      }
      DelegationDetail: {
        payload: Prisma.$DelegationDetailPayload<ExtArgs>
        fields: Prisma.DelegationDetailFieldRefs
        operations: {
          findUnique: {
            args: Prisma.DelegationDetailFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DelegationDetailPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.DelegationDetailFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DelegationDetailPayload>
          }
          findFirst: {
            args: Prisma.DelegationDetailFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DelegationDetailPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.DelegationDetailFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DelegationDetailPayload>
          }
          findMany: {
            args: Prisma.DelegationDetailFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DelegationDetailPayload>[]
          }
          create: {
            args: Prisma.DelegationDetailCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DelegationDetailPayload>
          }
          createMany: {
            args: Prisma.DelegationDetailCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          delete: {
            args: Prisma.DelegationDetailDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DelegationDetailPayload>
          }
          update: {
            args: Prisma.DelegationDetailUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DelegationDetailPayload>
          }
          deleteMany: {
            args: Prisma.DelegationDetailDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.DelegationDetailUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.DelegationDetailUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DelegationDetailPayload>
          }
          aggregate: {
            args: Prisma.DelegationDetailAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateDelegationDetail>
          }
          groupBy: {
            args: Prisma.DelegationDetailGroupByArgs<ExtArgs>
            result: $Utils.Optional<DelegationDetailGroupByOutputType>[]
          }
          count: {
            args: Prisma.DelegationDetailCountArgs<ExtArgs>
            result: $Utils.Optional<DelegationDetailCountAggregateOutputType> | number
          }
        }
      }
      RolePrivilege: {
        payload: Prisma.$RolePrivilegePayload<ExtArgs>
        fields: Prisma.RolePrivilegeFieldRefs
        operations: {
          findUnique: {
            args: Prisma.RolePrivilegeFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePrivilegePayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.RolePrivilegeFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePrivilegePayload>
          }
          findFirst: {
            args: Prisma.RolePrivilegeFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePrivilegePayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.RolePrivilegeFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePrivilegePayload>
          }
          findMany: {
            args: Prisma.RolePrivilegeFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePrivilegePayload>[]
          }
          create: {
            args: Prisma.RolePrivilegeCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePrivilegePayload>
          }
          createMany: {
            args: Prisma.RolePrivilegeCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          delete: {
            args: Prisma.RolePrivilegeDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePrivilegePayload>
          }
          update: {
            args: Prisma.RolePrivilegeUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePrivilegePayload>
          }
          deleteMany: {
            args: Prisma.RolePrivilegeDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.RolePrivilegeUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.RolePrivilegeUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RolePrivilegePayload>
          }
          aggregate: {
            args: Prisma.RolePrivilegeAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateRolePrivilege>
          }
          groupBy: {
            args: Prisma.RolePrivilegeGroupByArgs<ExtArgs>
            result: $Utils.Optional<RolePrivilegeGroupByOutputType>[]
          }
          count: {
            args: Prisma.RolePrivilegeCountArgs<ExtArgs>
            result: $Utils.Optional<RolePrivilegeCountAggregateOutputType> | number
          }
        }
      }
    }
  } & {
    other: {
      payload: any
      operations: {
        $executeRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $executeRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
        $queryRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $queryRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
      }
    }
  }
  export const defineExtension: $Extensions.ExtendsHook<"define", Prisma.TypeMapCb, $Extensions.DefaultArgs>
  export type DefaultPrismaClient = PrismaClient
  export type ErrorFormat = 'pretty' | 'colorless' | 'minimal'
  export interface PrismaClientOptions {
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasources?: Datasources
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasourceUrl?: string
    /**
     * @default "colorless"
     */
    errorFormat?: ErrorFormat
    /**
     * @example
     * ```
     * // Shorthand for `emit: 'stdout'`
     * log: ['query', 'info', 'warn', 'error']
     * 
     * // Emit as events only
     * log: [
     *   { emit: 'event', level: 'query' },
     *   { emit: 'event', level: 'info' },
     *   { emit: 'event', level: 'warn' }
     *   { emit: 'event', level: 'error' }
     * ]
     * 
     * / Emit as events and log to stdout
     * og: [
     *  { emit: 'stdout', level: 'query' },
     *  { emit: 'stdout', level: 'info' },
     *  { emit: 'stdout', level: 'warn' }
     *  { emit: 'stdout', level: 'error' }
     * 
     * ```
     * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/logging#the-log-option).
     */
    log?: (LogLevel | LogDefinition)[]
    /**
     * The default values for transactionOptions
     * maxWait ?= 2000
     * timeout ?= 5000
     */
    transactionOptions?: {
      maxWait?: number
      timeout?: number
      isolationLevel?: Prisma.TransactionIsolationLevel
    }
    /**
     * Instance of a Driver Adapter, e.g., like one provided by `@prisma/adapter-planetscale`
     */
    adapter?: runtime.SqlDriverAdapterFactory | null
    /**
     * Global configuration for omitting model fields by default.
     * 
     * @example
     * ```
     * const prisma = new PrismaClient({
     *   omit: {
     *     user: {
     *       password: true
     *     }
     *   }
     * })
     * ```
     */
    omit?: Prisma.GlobalOmitConfig
  }
  export type GlobalOmitConfig = {
    user?: UserOmit
    organization?: OrganizationOmit
    position?: PositionOmit
    employment?: EmploymentOmit
    client?: ClientOmit
    role?: RoleOmit
    positionRole?: PositionRoleOmit
    employmentRole?: EmploymentRoleOmit
    organizationRole?: OrganizationRoleOmit
    authObject?: AuthObjectOmit
    privilege?: PrivilegeOmit
    privilegeDelegation?: PrivilegeDelegationOmit
    delegationDetail?: DelegationDetailOmit
    rolePrivilege?: RolePrivilegeOmit
  }

  /* Types for Logging */
  export type LogLevel = 'info' | 'query' | 'warn' | 'error'
  export type LogDefinition = {
    level: LogLevel
    emit: 'stdout' | 'event'
  }

  export type CheckIsLogLevel<T> = T extends LogLevel ? T : never;

  export type GetLogType<T> = CheckIsLogLevel<
    T extends LogDefinition ? T['level'] : T
  >;

  export type GetEvents<T extends any[]> = T extends Array<LogLevel | LogDefinition>
    ? GetLogType<T[number]>
    : never;

  export type QueryEvent = {
    timestamp: Date
    query: string
    params: string
    duration: number
    target: string
  }

  export type LogEvent = {
    timestamp: Date
    message: string
    target: string
  }
  /* End Types for Logging */


  export type PrismaAction =
    | 'findUnique'
    | 'findUniqueOrThrow'
    | 'findMany'
    | 'findFirst'
    | 'findFirstOrThrow'
    | 'create'
    | 'createMany'
    | 'createManyAndReturn'
    | 'update'
    | 'updateMany'
    | 'updateManyAndReturn'
    | 'upsert'
    | 'delete'
    | 'deleteMany'
    | 'executeRaw'
    | 'queryRaw'
    | 'aggregate'
    | 'count'
    | 'runCommandRaw'
    | 'findRaw'
    | 'groupBy'

  // tested in getLogLevel.test.ts
  export function getLogLevel(log: Array<LogLevel | LogDefinition>): LogLevel | undefined;

  /**
   * `PrismaClient` proxy available in interactive transactions.
   */
  export type TransactionClient = Omit<Prisma.DefaultPrismaClient, runtime.ITXClientDenyList>

  export type Datasource = {
    url?: string
  }

  /**
   * Count Types
   */


  /**
   * Count Type UserCountOutputType
   */

  export type UserCountOutputType = {
    employments: number
    delegationTo: number
    delegationFrom: number
  }

  export type UserCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    employments?: boolean | UserCountOutputTypeCountEmploymentsArgs
    delegationTo?: boolean | UserCountOutputTypeCountDelegationToArgs
    delegationFrom?: boolean | UserCountOutputTypeCountDelegationFromArgs
  }

  // Custom InputTypes
  /**
   * UserCountOutputType without action
   */
  export type UserCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the UserCountOutputType
     */
    select?: UserCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * UserCountOutputType without action
   */
  export type UserCountOutputTypeCountEmploymentsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: EmploymentWhereInput
  }

  /**
   * UserCountOutputType without action
   */
  export type UserCountOutputTypeCountDelegationToArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: PrivilegeDelegationWhereInput
  }

  /**
   * UserCountOutputType without action
   */
  export type UserCountOutputTypeCountDelegationFromArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: PrivilegeDelegationWhereInput
  }


  /**
   * Count Type OrganizationCountOutputType
   */

  export type OrganizationCountOutputType = {
    deptEmployments: number
    compEmployments: number
    roles: number
  }

  export type OrganizationCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    deptEmployments?: boolean | OrganizationCountOutputTypeCountDeptEmploymentsArgs
    compEmployments?: boolean | OrganizationCountOutputTypeCountCompEmploymentsArgs
    roles?: boolean | OrganizationCountOutputTypeCountRolesArgs
  }

  // Custom InputTypes
  /**
   * OrganizationCountOutputType without action
   */
  export type OrganizationCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OrganizationCountOutputType
     */
    select?: OrganizationCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * OrganizationCountOutputType without action
   */
  export type OrganizationCountOutputTypeCountDeptEmploymentsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: EmploymentWhereInput
  }

  /**
   * OrganizationCountOutputType without action
   */
  export type OrganizationCountOutputTypeCountCompEmploymentsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: EmploymentWhereInput
  }

  /**
   * OrganizationCountOutputType without action
   */
  export type OrganizationCountOutputTypeCountRolesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: OrganizationRoleWhereInput
  }


  /**
   * Count Type PositionCountOutputType
   */

  export type PositionCountOutputType = {
    employments: number
    roles: number
  }

  export type PositionCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    employments?: boolean | PositionCountOutputTypeCountEmploymentsArgs
    roles?: boolean | PositionCountOutputTypeCountRolesArgs
  }

  // Custom InputTypes
  /**
   * PositionCountOutputType without action
   */
  export type PositionCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PositionCountOutputType
     */
    select?: PositionCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * PositionCountOutputType without action
   */
  export type PositionCountOutputTypeCountEmploymentsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: EmploymentWhereInput
  }

  /**
   * PositionCountOutputType without action
   */
  export type PositionCountOutputTypeCountRolesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: PositionRoleWhereInput
  }


  /**
   * Count Type EmploymentCountOutputType
   */

  export type EmploymentCountOutputType = {
    roles: number
  }

  export type EmploymentCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    roles?: boolean | EmploymentCountOutputTypeCountRolesArgs
  }

  // Custom InputTypes
  /**
   * EmploymentCountOutputType without action
   */
  export type EmploymentCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EmploymentCountOutputType
     */
    select?: EmploymentCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * EmploymentCountOutputType without action
   */
  export type EmploymentCountOutputTypeCountRolesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: EmploymentRoleWhereInput
  }


  /**
   * Count Type ClientCountOutputType
   */

  export type ClientCountOutputType = {
    role: number
  }

  export type ClientCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    role?: boolean | ClientCountOutputTypeCountRoleArgs
  }

  // Custom InputTypes
  /**
   * ClientCountOutputType without action
   */
  export type ClientCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ClientCountOutputType
     */
    select?: ClientCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * ClientCountOutputType without action
   */
  export type ClientCountOutputTypeCountRoleArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: RoleWhereInput
  }


  /**
   * Count Type RoleCountOutputType
   */

  export type RoleCountOutputType = {
    positions: number
    organizations: number
    employments: number
    privileges: number
  }

  export type RoleCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    positions?: boolean | RoleCountOutputTypeCountPositionsArgs
    organizations?: boolean | RoleCountOutputTypeCountOrganizationsArgs
    employments?: boolean | RoleCountOutputTypeCountEmploymentsArgs
    privileges?: boolean | RoleCountOutputTypeCountPrivilegesArgs
  }

  // Custom InputTypes
  /**
   * RoleCountOutputType without action
   */
  export type RoleCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RoleCountOutputType
     */
    select?: RoleCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * RoleCountOutputType without action
   */
  export type RoleCountOutputTypeCountPositionsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: PositionRoleWhereInput
  }

  /**
   * RoleCountOutputType without action
   */
  export type RoleCountOutputTypeCountOrganizationsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: OrganizationRoleWhereInput
  }

  /**
   * RoleCountOutputType without action
   */
  export type RoleCountOutputTypeCountEmploymentsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: EmploymentRoleWhereInput
  }

  /**
   * RoleCountOutputType without action
   */
  export type RoleCountOutputTypeCountPrivilegesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: RolePrivilegeWhereInput
  }


  /**
   * Count Type AuthObjectCountOutputType
   */

  export type AuthObjectCountOutputType = {
    privileges: number
  }

  export type AuthObjectCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    privileges?: boolean | AuthObjectCountOutputTypeCountPrivilegesArgs
  }

  // Custom InputTypes
  /**
   * AuthObjectCountOutputType without action
   */
  export type AuthObjectCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuthObjectCountOutputType
     */
    select?: AuthObjectCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * AuthObjectCountOutputType without action
   */
  export type AuthObjectCountOutputTypeCountPrivilegesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: PrivilegeWhereInput
  }


  /**
   * Count Type PrivilegeCountOutputType
   */

  export type PrivilegeCountOutputType = {
    roles: number
  }

  export type PrivilegeCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    roles?: boolean | PrivilegeCountOutputTypeCountRolesArgs
  }

  // Custom InputTypes
  /**
   * PrivilegeCountOutputType without action
   */
  export type PrivilegeCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PrivilegeCountOutputType
     */
    select?: PrivilegeCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * PrivilegeCountOutputType without action
   */
  export type PrivilegeCountOutputTypeCountRolesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: RolePrivilegeWhereInput
  }


  /**
   * Count Type PrivilegeDelegationCountOutputType
   */

  export type PrivilegeDelegationCountOutputType = {
    delegationDetails: number
  }

  export type PrivilegeDelegationCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    delegationDetails?: boolean | PrivilegeDelegationCountOutputTypeCountDelegationDetailsArgs
  }

  // Custom InputTypes
  /**
   * PrivilegeDelegationCountOutputType without action
   */
  export type PrivilegeDelegationCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PrivilegeDelegationCountOutputType
     */
    select?: PrivilegeDelegationCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * PrivilegeDelegationCountOutputType without action
   */
  export type PrivilegeDelegationCountOutputTypeCountDelegationDetailsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: DelegationDetailWhereInput
  }


  /**
   * Models
   */

  /**
   * Model User
   */

  export type AggregateUser = {
    _count: UserCountAggregateOutputType | null
    _avg: UserAvgAggregateOutputType | null
    _sum: UserSumAggregateOutputType | null
    _min: UserMinAggregateOutputType | null
    _max: UserMaxAggregateOutputType | null
  }

  export type UserAvgAggregateOutputType = {
    id: number | null
    status: number | null
  }

  export type UserSumAggregateOutputType = {
    id: number | null
    status: number | null
  }

  export type UserMinAggregateOutputType = {
    id: number | null
    username: string | null
    name: string | null
    password: string | null
    mobilePhone: string | null
    userType: string | null
    status: number | null
    isDelete: boolean | null
    createTime: Date | null
    updateTime: Date | null
  }

  export type UserMaxAggregateOutputType = {
    id: number | null
    username: string | null
    name: string | null
    password: string | null
    mobilePhone: string | null
    userType: string | null
    status: number | null
    isDelete: boolean | null
    createTime: Date | null
    updateTime: Date | null
  }

  export type UserCountAggregateOutputType = {
    id: number
    username: number
    name: number
    password: number
    mobilePhone: number
    userType: number
    status: number
    isDelete: number
    createTime: number
    updateTime: number
    _all: number
  }


  export type UserAvgAggregateInputType = {
    id?: true
    status?: true
  }

  export type UserSumAggregateInputType = {
    id?: true
    status?: true
  }

  export type UserMinAggregateInputType = {
    id?: true
    username?: true
    name?: true
    password?: true
    mobilePhone?: true
    userType?: true
    status?: true
    isDelete?: true
    createTime?: true
    updateTime?: true
  }

  export type UserMaxAggregateInputType = {
    id?: true
    username?: true
    name?: true
    password?: true
    mobilePhone?: true
    userType?: true
    status?: true
    isDelete?: true
    createTime?: true
    updateTime?: true
  }

  export type UserCountAggregateInputType = {
    id?: true
    username?: true
    name?: true
    password?: true
    mobilePhone?: true
    userType?: true
    status?: true
    isDelete?: true
    createTime?: true
    updateTime?: true
    _all?: true
  }

  export type UserAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which User to aggregate.
     */
    where?: UserWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Users to fetch.
     */
    orderBy?: UserOrderByWithRelationInput | UserOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: UserWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Users from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Users.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Users
    **/
    _count?: true | UserCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: UserAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: UserSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: UserMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: UserMaxAggregateInputType
  }

  export type GetUserAggregateType<T extends UserAggregateArgs> = {
        [P in keyof T & keyof AggregateUser]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateUser[P]>
      : GetScalarType<T[P], AggregateUser[P]>
  }




  export type UserGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: UserWhereInput
    orderBy?: UserOrderByWithAggregationInput | UserOrderByWithAggregationInput[]
    by: UserScalarFieldEnum[] | UserScalarFieldEnum
    having?: UserScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: UserCountAggregateInputType | true
    _avg?: UserAvgAggregateInputType
    _sum?: UserSumAggregateInputType
    _min?: UserMinAggregateInputType
    _max?: UserMaxAggregateInputType
  }

  export type UserGroupByOutputType = {
    id: number
    username: string
    name: string
    password: string | null
    mobilePhone: string | null
    userType: string | null
    status: number
    isDelete: boolean
    createTime: Date
    updateTime: Date
    _count: UserCountAggregateOutputType | null
    _avg: UserAvgAggregateOutputType | null
    _sum: UserSumAggregateOutputType | null
    _min: UserMinAggregateOutputType | null
    _max: UserMaxAggregateOutputType | null
  }

  type GetUserGroupByPayload<T extends UserGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<UserGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof UserGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], UserGroupByOutputType[P]>
            : GetScalarType<T[P], UserGroupByOutputType[P]>
        }
      >
    >


  export type UserSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    username?: boolean
    name?: boolean
    password?: boolean
    mobilePhone?: boolean
    userType?: boolean
    status?: boolean
    isDelete?: boolean
    createTime?: boolean
    updateTime?: boolean
    employments?: boolean | User$employmentsArgs<ExtArgs>
    delegationTo?: boolean | User$delegationToArgs<ExtArgs>
    delegationFrom?: boolean | User$delegationFromArgs<ExtArgs>
    _count?: boolean | UserCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["user"]>



  export type UserSelectScalar = {
    id?: boolean
    username?: boolean
    name?: boolean
    password?: boolean
    mobilePhone?: boolean
    userType?: boolean
    status?: boolean
    isDelete?: boolean
    createTime?: boolean
    updateTime?: boolean
  }

  export type UserOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "username" | "name" | "password" | "mobilePhone" | "userType" | "status" | "isDelete" | "createTime" | "updateTime", ExtArgs["result"]["user"]>
  export type UserInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    employments?: boolean | User$employmentsArgs<ExtArgs>
    delegationTo?: boolean | User$delegationToArgs<ExtArgs>
    delegationFrom?: boolean | User$delegationFromArgs<ExtArgs>
    _count?: boolean | UserCountOutputTypeDefaultArgs<ExtArgs>
  }

  export type $UserPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "User"
    objects: {
      employments: Prisma.$EmploymentPayload<ExtArgs>[]
      delegationTo: Prisma.$PrivilegeDelegationPayload<ExtArgs>[]
      delegationFrom: Prisma.$PrivilegeDelegationPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: number
      username: string
      name: string
      password: string | null
      mobilePhone: string | null
      userType: string | null
      status: number
      isDelete: boolean
      createTime: Date
      updateTime: Date
    }, ExtArgs["result"]["user"]>
    composites: {}
  }

  type UserGetPayload<S extends boolean | null | undefined | UserDefaultArgs> = $Result.GetResult<Prisma.$UserPayload, S>

  type UserCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<UserFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: UserCountAggregateInputType | true
    }

  export interface UserDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['User'], meta: { name: 'User' } }
    /**
     * Find zero or one User that matches the filter.
     * @param {UserFindUniqueArgs} args - Arguments to find a User
     * @example
     * // Get one User
     * const user = await prisma.user.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends UserFindUniqueArgs>(args: SelectSubset<T, UserFindUniqueArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one User that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {UserFindUniqueOrThrowArgs} args - Arguments to find a User
     * @example
     * // Get one User
     * const user = await prisma.user.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends UserFindUniqueOrThrowArgs>(args: SelectSubset<T, UserFindUniqueOrThrowArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first User that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserFindFirstArgs} args - Arguments to find a User
     * @example
     * // Get one User
     * const user = await prisma.user.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends UserFindFirstArgs>(args?: SelectSubset<T, UserFindFirstArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first User that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserFindFirstOrThrowArgs} args - Arguments to find a User
     * @example
     * // Get one User
     * const user = await prisma.user.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends UserFindFirstOrThrowArgs>(args?: SelectSubset<T, UserFindFirstOrThrowArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Users that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Users
     * const users = await prisma.user.findMany()
     * 
     * // Get first 10 Users
     * const users = await prisma.user.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const userWithIdOnly = await prisma.user.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends UserFindManyArgs>(args?: SelectSubset<T, UserFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a User.
     * @param {UserCreateArgs} args - Arguments to create a User.
     * @example
     * // Create one User
     * const User = await prisma.user.create({
     *   data: {
     *     // ... data to create a User
     *   }
     * })
     * 
     */
    create<T extends UserCreateArgs>(args: SelectSubset<T, UserCreateArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Users.
     * @param {UserCreateManyArgs} args - Arguments to create many Users.
     * @example
     * // Create many Users
     * const user = await prisma.user.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends UserCreateManyArgs>(args?: SelectSubset<T, UserCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Delete a User.
     * @param {UserDeleteArgs} args - Arguments to delete one User.
     * @example
     * // Delete one User
     * const User = await prisma.user.delete({
     *   where: {
     *     // ... filter to delete one User
     *   }
     * })
     * 
     */
    delete<T extends UserDeleteArgs>(args: SelectSubset<T, UserDeleteArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one User.
     * @param {UserUpdateArgs} args - Arguments to update one User.
     * @example
     * // Update one User
     * const user = await prisma.user.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends UserUpdateArgs>(args: SelectSubset<T, UserUpdateArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Users.
     * @param {UserDeleteManyArgs} args - Arguments to filter Users to delete.
     * @example
     * // Delete a few Users
     * const { count } = await prisma.user.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends UserDeleteManyArgs>(args?: SelectSubset<T, UserDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Users.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Users
     * const user = await prisma.user.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends UserUpdateManyArgs>(args: SelectSubset<T, UserUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one User.
     * @param {UserUpsertArgs} args - Arguments to update or create a User.
     * @example
     * // Update or create a User
     * const user = await prisma.user.upsert({
     *   create: {
     *     // ... data to create a User
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the User we want to update
     *   }
     * })
     */
    upsert<T extends UserUpsertArgs>(args: SelectSubset<T, UserUpsertArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Users.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserCountArgs} args - Arguments to filter Users to count.
     * @example
     * // Count the number of Users
     * const count = await prisma.user.count({
     *   where: {
     *     // ... the filter for the Users we want to count
     *   }
     * })
    **/
    count<T extends UserCountArgs>(
      args?: Subset<T, UserCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], UserCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a User.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends UserAggregateArgs>(args: Subset<T, UserAggregateArgs>): Prisma.PrismaPromise<GetUserAggregateType<T>>

    /**
     * Group by User.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {UserGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends UserGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: UserGroupByArgs['orderBy'] }
        : { orderBy?: UserGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, UserGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetUserGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the User model
   */
  readonly fields: UserFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for User.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__UserClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    employments<T extends User$employmentsArgs<ExtArgs> = {}>(args?: Subset<T, User$employmentsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$EmploymentPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    delegationTo<T extends User$delegationToArgs<ExtArgs> = {}>(args?: Subset<T, User$delegationToArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$PrivilegeDelegationPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    delegationFrom<T extends User$delegationFromArgs<ExtArgs> = {}>(args?: Subset<T, User$delegationFromArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$PrivilegeDelegationPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the User model
   */
  interface UserFieldRefs {
    readonly id: FieldRef<"User", 'Int'>
    readonly username: FieldRef<"User", 'String'>
    readonly name: FieldRef<"User", 'String'>
    readonly password: FieldRef<"User", 'String'>
    readonly mobilePhone: FieldRef<"User", 'String'>
    readonly userType: FieldRef<"User", 'String'>
    readonly status: FieldRef<"User", 'Int'>
    readonly isDelete: FieldRef<"User", 'Boolean'>
    readonly createTime: FieldRef<"User", 'DateTime'>
    readonly updateTime: FieldRef<"User", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * User findUnique
   */
  export type UserFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * Filter, which User to fetch.
     */
    where: UserWhereUniqueInput
  }

  /**
   * User findUniqueOrThrow
   */
  export type UserFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * Filter, which User to fetch.
     */
    where: UserWhereUniqueInput
  }

  /**
   * User findFirst
   */
  export type UserFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * Filter, which User to fetch.
     */
    where?: UserWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Users to fetch.
     */
    orderBy?: UserOrderByWithRelationInput | UserOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Users.
     */
    cursor?: UserWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Users from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Users.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Users.
     */
    distinct?: UserScalarFieldEnum | UserScalarFieldEnum[]
  }

  /**
   * User findFirstOrThrow
   */
  export type UserFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * Filter, which User to fetch.
     */
    where?: UserWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Users to fetch.
     */
    orderBy?: UserOrderByWithRelationInput | UserOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Users.
     */
    cursor?: UserWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Users from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Users.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Users.
     */
    distinct?: UserScalarFieldEnum | UserScalarFieldEnum[]
  }

  /**
   * User findMany
   */
  export type UserFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * Filter, which Users to fetch.
     */
    where?: UserWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Users to fetch.
     */
    orderBy?: UserOrderByWithRelationInput | UserOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Users.
     */
    cursor?: UserWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Users from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Users.
     */
    skip?: number
    distinct?: UserScalarFieldEnum | UserScalarFieldEnum[]
  }

  /**
   * User create
   */
  export type UserCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * The data needed to create a User.
     */
    data: XOR<UserCreateInput, UserUncheckedCreateInput>
  }

  /**
   * User createMany
   */
  export type UserCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Users.
     */
    data: UserCreateManyInput | UserCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * User update
   */
  export type UserUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * The data needed to update a User.
     */
    data: XOR<UserUpdateInput, UserUncheckedUpdateInput>
    /**
     * Choose, which User to update.
     */
    where: UserWhereUniqueInput
  }

  /**
   * User updateMany
   */
  export type UserUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Users.
     */
    data: XOR<UserUpdateManyMutationInput, UserUncheckedUpdateManyInput>
    /**
     * Filter which Users to update
     */
    where?: UserWhereInput
    /**
     * Limit how many Users to update.
     */
    limit?: number
  }

  /**
   * User upsert
   */
  export type UserUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * The filter to search for the User to update in case it exists.
     */
    where: UserWhereUniqueInput
    /**
     * In case the User found by the `where` argument doesn't exist, create a new User with this data.
     */
    create: XOR<UserCreateInput, UserUncheckedCreateInput>
    /**
     * In case the User was found with the provided `where` argument, update it with this data.
     */
    update: XOR<UserUpdateInput, UserUncheckedUpdateInput>
  }

  /**
   * User delete
   */
  export type UserDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
    /**
     * Filter which User to delete.
     */
    where: UserWhereUniqueInput
  }

  /**
   * User deleteMany
   */
  export type UserDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Users to delete
     */
    where?: UserWhereInput
    /**
     * Limit how many Users to delete.
     */
    limit?: number
  }

  /**
   * User.employments
   */
  export type User$employmentsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Employment
     */
    select?: EmploymentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Employment
     */
    omit?: EmploymentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EmploymentInclude<ExtArgs> | null
    where?: EmploymentWhereInput
    orderBy?: EmploymentOrderByWithRelationInput | EmploymentOrderByWithRelationInput[]
    cursor?: EmploymentWhereUniqueInput
    take?: number
    skip?: number
    distinct?: EmploymentScalarFieldEnum | EmploymentScalarFieldEnum[]
  }

  /**
   * User.delegationTo
   */
  export type User$delegationToArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PrivilegeDelegation
     */
    select?: PrivilegeDelegationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the PrivilegeDelegation
     */
    omit?: PrivilegeDelegationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PrivilegeDelegationInclude<ExtArgs> | null
    where?: PrivilegeDelegationWhereInput
    orderBy?: PrivilegeDelegationOrderByWithRelationInput | PrivilegeDelegationOrderByWithRelationInput[]
    cursor?: PrivilegeDelegationWhereUniqueInput
    take?: number
    skip?: number
    distinct?: PrivilegeDelegationScalarFieldEnum | PrivilegeDelegationScalarFieldEnum[]
  }

  /**
   * User.delegationFrom
   */
  export type User$delegationFromArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PrivilegeDelegation
     */
    select?: PrivilegeDelegationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the PrivilegeDelegation
     */
    omit?: PrivilegeDelegationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PrivilegeDelegationInclude<ExtArgs> | null
    where?: PrivilegeDelegationWhereInput
    orderBy?: PrivilegeDelegationOrderByWithRelationInput | PrivilegeDelegationOrderByWithRelationInput[]
    cursor?: PrivilegeDelegationWhereUniqueInput
    take?: number
    skip?: number
    distinct?: PrivilegeDelegationScalarFieldEnum | PrivilegeDelegationScalarFieldEnum[]
  }

  /**
   * User without action
   */
  export type UserDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the User
     */
    select?: UserSelect<ExtArgs> | null
    /**
     * Omit specific fields from the User
     */
    omit?: UserOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: UserInclude<ExtArgs> | null
  }


  /**
   * Model Organization
   */

  export type AggregateOrganization = {
    _count: OrganizationCountAggregateOutputType | null
    _avg: OrganizationAvgAggregateOutputType | null
    _sum: OrganizationSumAggregateOutputType | null
    _min: OrganizationMinAggregateOutputType | null
    _max: OrganizationMaxAggregateOutputType | null
  }

  export type OrganizationAvgAggregateOutputType = {
    id: number | null
    parentId: number | null
    businessParentId: number | null
    level: number | null
    orderNum: number | null
  }

  export type OrganizationSumAggregateOutputType = {
    id: number | null
    parentId: number | null
    businessParentId: number | null
    level: number | null
    orderNum: number | null
  }

  export type OrganizationMinAggregateOutputType = {
    id: number | null
    orgCode: string | null
    orgName: string | null
    parentId: number | null
    businessParentId: number | null
    level: number | null
    orgType: string | null
    orderNum: number | null
    isVirtual: boolean | null
    isEntity: boolean | null
    status: boolean | null
    isDelete: boolean | null
    createTime: Date | null
    updateTime: Date | null
  }

  export type OrganizationMaxAggregateOutputType = {
    id: number | null
    orgCode: string | null
    orgName: string | null
    parentId: number | null
    businessParentId: number | null
    level: number | null
    orgType: string | null
    orderNum: number | null
    isVirtual: boolean | null
    isEntity: boolean | null
    status: boolean | null
    isDelete: boolean | null
    createTime: Date | null
    updateTime: Date | null
  }

  export type OrganizationCountAggregateOutputType = {
    id: number
    orgCode: number
    orgName: number
    parentId: number
    businessParentId: number
    level: number
    orgType: number
    orderNum: number
    isVirtual: number
    isEntity: number
    status: number
    isDelete: number
    createTime: number
    updateTime: number
    _all: number
  }


  export type OrganizationAvgAggregateInputType = {
    id?: true
    parentId?: true
    businessParentId?: true
    level?: true
    orderNum?: true
  }

  export type OrganizationSumAggregateInputType = {
    id?: true
    parentId?: true
    businessParentId?: true
    level?: true
    orderNum?: true
  }

  export type OrganizationMinAggregateInputType = {
    id?: true
    orgCode?: true
    orgName?: true
    parentId?: true
    businessParentId?: true
    level?: true
    orgType?: true
    orderNum?: true
    isVirtual?: true
    isEntity?: true
    status?: true
    isDelete?: true
    createTime?: true
    updateTime?: true
  }

  export type OrganizationMaxAggregateInputType = {
    id?: true
    orgCode?: true
    orgName?: true
    parentId?: true
    businessParentId?: true
    level?: true
    orgType?: true
    orderNum?: true
    isVirtual?: true
    isEntity?: true
    status?: true
    isDelete?: true
    createTime?: true
    updateTime?: true
  }

  export type OrganizationCountAggregateInputType = {
    id?: true
    orgCode?: true
    orgName?: true
    parentId?: true
    businessParentId?: true
    level?: true
    orgType?: true
    orderNum?: true
    isVirtual?: true
    isEntity?: true
    status?: true
    isDelete?: true
    createTime?: true
    updateTime?: true
    _all?: true
  }

  export type OrganizationAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Organization to aggregate.
     */
    where?: OrganizationWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Organizations to fetch.
     */
    orderBy?: OrganizationOrderByWithRelationInput | OrganizationOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: OrganizationWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Organizations from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Organizations.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Organizations
    **/
    _count?: true | OrganizationCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: OrganizationAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: OrganizationSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: OrganizationMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: OrganizationMaxAggregateInputType
  }

  export type GetOrganizationAggregateType<T extends OrganizationAggregateArgs> = {
        [P in keyof T & keyof AggregateOrganization]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateOrganization[P]>
      : GetScalarType<T[P], AggregateOrganization[P]>
  }




  export type OrganizationGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: OrganizationWhereInput
    orderBy?: OrganizationOrderByWithAggregationInput | OrganizationOrderByWithAggregationInput[]
    by: OrganizationScalarFieldEnum[] | OrganizationScalarFieldEnum
    having?: OrganizationScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: OrganizationCountAggregateInputType | true
    _avg?: OrganizationAvgAggregateInputType
    _sum?: OrganizationSumAggregateInputType
    _min?: OrganizationMinAggregateInputType
    _max?: OrganizationMaxAggregateInputType
  }

  export type OrganizationGroupByOutputType = {
    id: number
    orgCode: string
    orgName: string
    parentId: number
    businessParentId: number
    level: number
    orgType: string
    orderNum: number
    isVirtual: boolean
    isEntity: boolean
    status: boolean
    isDelete: boolean
    createTime: Date
    updateTime: Date
    _count: OrganizationCountAggregateOutputType | null
    _avg: OrganizationAvgAggregateOutputType | null
    _sum: OrganizationSumAggregateOutputType | null
    _min: OrganizationMinAggregateOutputType | null
    _max: OrganizationMaxAggregateOutputType | null
  }

  type GetOrganizationGroupByPayload<T extends OrganizationGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<OrganizationGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof OrganizationGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], OrganizationGroupByOutputType[P]>
            : GetScalarType<T[P], OrganizationGroupByOutputType[P]>
        }
      >
    >


  export type OrganizationSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    orgCode?: boolean
    orgName?: boolean
    parentId?: boolean
    businessParentId?: boolean
    level?: boolean
    orgType?: boolean
    orderNum?: boolean
    isVirtual?: boolean
    isEntity?: boolean
    status?: boolean
    isDelete?: boolean
    createTime?: boolean
    updateTime?: boolean
    deptEmployments?: boolean | Organization$deptEmploymentsArgs<ExtArgs>
    compEmployments?: boolean | Organization$compEmploymentsArgs<ExtArgs>
    roles?: boolean | Organization$rolesArgs<ExtArgs>
    _count?: boolean | OrganizationCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["organization"]>



  export type OrganizationSelectScalar = {
    id?: boolean
    orgCode?: boolean
    orgName?: boolean
    parentId?: boolean
    businessParentId?: boolean
    level?: boolean
    orgType?: boolean
    orderNum?: boolean
    isVirtual?: boolean
    isEntity?: boolean
    status?: boolean
    isDelete?: boolean
    createTime?: boolean
    updateTime?: boolean
  }

  export type OrganizationOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "orgCode" | "orgName" | "parentId" | "businessParentId" | "level" | "orgType" | "orderNum" | "isVirtual" | "isEntity" | "status" | "isDelete" | "createTime" | "updateTime", ExtArgs["result"]["organization"]>
  export type OrganizationInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    deptEmployments?: boolean | Organization$deptEmploymentsArgs<ExtArgs>
    compEmployments?: boolean | Organization$compEmploymentsArgs<ExtArgs>
    roles?: boolean | Organization$rolesArgs<ExtArgs>
    _count?: boolean | OrganizationCountOutputTypeDefaultArgs<ExtArgs>
  }

  export type $OrganizationPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Organization"
    objects: {
      deptEmployments: Prisma.$EmploymentPayload<ExtArgs>[]
      compEmployments: Prisma.$EmploymentPayload<ExtArgs>[]
      roles: Prisma.$OrganizationRolePayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: number
      orgCode: string
      orgName: string
      parentId: number
      businessParentId: number
      level: number
      orgType: string
      orderNum: number
      isVirtual: boolean
      isEntity: boolean
      status: boolean
      isDelete: boolean
      createTime: Date
      updateTime: Date
    }, ExtArgs["result"]["organization"]>
    composites: {}
  }

  type OrganizationGetPayload<S extends boolean | null | undefined | OrganizationDefaultArgs> = $Result.GetResult<Prisma.$OrganizationPayload, S>

  type OrganizationCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<OrganizationFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: OrganizationCountAggregateInputType | true
    }

  export interface OrganizationDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Organization'], meta: { name: 'Organization' } }
    /**
     * Find zero or one Organization that matches the filter.
     * @param {OrganizationFindUniqueArgs} args - Arguments to find a Organization
     * @example
     * // Get one Organization
     * const organization = await prisma.organization.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends OrganizationFindUniqueArgs>(args: SelectSubset<T, OrganizationFindUniqueArgs<ExtArgs>>): Prisma__OrganizationClient<$Result.GetResult<Prisma.$OrganizationPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Organization that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {OrganizationFindUniqueOrThrowArgs} args - Arguments to find a Organization
     * @example
     * // Get one Organization
     * const organization = await prisma.organization.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends OrganizationFindUniqueOrThrowArgs>(args: SelectSubset<T, OrganizationFindUniqueOrThrowArgs<ExtArgs>>): Prisma__OrganizationClient<$Result.GetResult<Prisma.$OrganizationPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Organization that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OrganizationFindFirstArgs} args - Arguments to find a Organization
     * @example
     * // Get one Organization
     * const organization = await prisma.organization.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends OrganizationFindFirstArgs>(args?: SelectSubset<T, OrganizationFindFirstArgs<ExtArgs>>): Prisma__OrganizationClient<$Result.GetResult<Prisma.$OrganizationPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Organization that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OrganizationFindFirstOrThrowArgs} args - Arguments to find a Organization
     * @example
     * // Get one Organization
     * const organization = await prisma.organization.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends OrganizationFindFirstOrThrowArgs>(args?: SelectSubset<T, OrganizationFindFirstOrThrowArgs<ExtArgs>>): Prisma__OrganizationClient<$Result.GetResult<Prisma.$OrganizationPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Organizations that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OrganizationFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Organizations
     * const organizations = await prisma.organization.findMany()
     * 
     * // Get first 10 Organizations
     * const organizations = await prisma.organization.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const organizationWithIdOnly = await prisma.organization.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends OrganizationFindManyArgs>(args?: SelectSubset<T, OrganizationFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$OrganizationPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Organization.
     * @param {OrganizationCreateArgs} args - Arguments to create a Organization.
     * @example
     * // Create one Organization
     * const Organization = await prisma.organization.create({
     *   data: {
     *     // ... data to create a Organization
     *   }
     * })
     * 
     */
    create<T extends OrganizationCreateArgs>(args: SelectSubset<T, OrganizationCreateArgs<ExtArgs>>): Prisma__OrganizationClient<$Result.GetResult<Prisma.$OrganizationPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Organizations.
     * @param {OrganizationCreateManyArgs} args - Arguments to create many Organizations.
     * @example
     * // Create many Organizations
     * const organization = await prisma.organization.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends OrganizationCreateManyArgs>(args?: SelectSubset<T, OrganizationCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Delete a Organization.
     * @param {OrganizationDeleteArgs} args - Arguments to delete one Organization.
     * @example
     * // Delete one Organization
     * const Organization = await prisma.organization.delete({
     *   where: {
     *     // ... filter to delete one Organization
     *   }
     * })
     * 
     */
    delete<T extends OrganizationDeleteArgs>(args: SelectSubset<T, OrganizationDeleteArgs<ExtArgs>>): Prisma__OrganizationClient<$Result.GetResult<Prisma.$OrganizationPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Organization.
     * @param {OrganizationUpdateArgs} args - Arguments to update one Organization.
     * @example
     * // Update one Organization
     * const organization = await prisma.organization.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends OrganizationUpdateArgs>(args: SelectSubset<T, OrganizationUpdateArgs<ExtArgs>>): Prisma__OrganizationClient<$Result.GetResult<Prisma.$OrganizationPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Organizations.
     * @param {OrganizationDeleteManyArgs} args - Arguments to filter Organizations to delete.
     * @example
     * // Delete a few Organizations
     * const { count } = await prisma.organization.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends OrganizationDeleteManyArgs>(args?: SelectSubset<T, OrganizationDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Organizations.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OrganizationUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Organizations
     * const organization = await prisma.organization.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends OrganizationUpdateManyArgs>(args: SelectSubset<T, OrganizationUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one Organization.
     * @param {OrganizationUpsertArgs} args - Arguments to update or create a Organization.
     * @example
     * // Update or create a Organization
     * const organization = await prisma.organization.upsert({
     *   create: {
     *     // ... data to create a Organization
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Organization we want to update
     *   }
     * })
     */
    upsert<T extends OrganizationUpsertArgs>(args: SelectSubset<T, OrganizationUpsertArgs<ExtArgs>>): Prisma__OrganizationClient<$Result.GetResult<Prisma.$OrganizationPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Organizations.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OrganizationCountArgs} args - Arguments to filter Organizations to count.
     * @example
     * // Count the number of Organizations
     * const count = await prisma.organization.count({
     *   where: {
     *     // ... the filter for the Organizations we want to count
     *   }
     * })
    **/
    count<T extends OrganizationCountArgs>(
      args?: Subset<T, OrganizationCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], OrganizationCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Organization.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OrganizationAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends OrganizationAggregateArgs>(args: Subset<T, OrganizationAggregateArgs>): Prisma.PrismaPromise<GetOrganizationAggregateType<T>>

    /**
     * Group by Organization.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OrganizationGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends OrganizationGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: OrganizationGroupByArgs['orderBy'] }
        : { orderBy?: OrganizationGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, OrganizationGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetOrganizationGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Organization model
   */
  readonly fields: OrganizationFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Organization.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__OrganizationClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    deptEmployments<T extends Organization$deptEmploymentsArgs<ExtArgs> = {}>(args?: Subset<T, Organization$deptEmploymentsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$EmploymentPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    compEmployments<T extends Organization$compEmploymentsArgs<ExtArgs> = {}>(args?: Subset<T, Organization$compEmploymentsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$EmploymentPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    roles<T extends Organization$rolesArgs<ExtArgs> = {}>(args?: Subset<T, Organization$rolesArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$OrganizationRolePayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Organization model
   */
  interface OrganizationFieldRefs {
    readonly id: FieldRef<"Organization", 'Int'>
    readonly orgCode: FieldRef<"Organization", 'String'>
    readonly orgName: FieldRef<"Organization", 'String'>
    readonly parentId: FieldRef<"Organization", 'Int'>
    readonly businessParentId: FieldRef<"Organization", 'Int'>
    readonly level: FieldRef<"Organization", 'Int'>
    readonly orgType: FieldRef<"Organization", 'String'>
    readonly orderNum: FieldRef<"Organization", 'Int'>
    readonly isVirtual: FieldRef<"Organization", 'Boolean'>
    readonly isEntity: FieldRef<"Organization", 'Boolean'>
    readonly status: FieldRef<"Organization", 'Boolean'>
    readonly isDelete: FieldRef<"Organization", 'Boolean'>
    readonly createTime: FieldRef<"Organization", 'DateTime'>
    readonly updateTime: FieldRef<"Organization", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Organization findUnique
   */
  export type OrganizationFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Organization
     */
    select?: OrganizationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Organization
     */
    omit?: OrganizationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OrganizationInclude<ExtArgs> | null
    /**
     * Filter, which Organization to fetch.
     */
    where: OrganizationWhereUniqueInput
  }

  /**
   * Organization findUniqueOrThrow
   */
  export type OrganizationFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Organization
     */
    select?: OrganizationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Organization
     */
    omit?: OrganizationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OrganizationInclude<ExtArgs> | null
    /**
     * Filter, which Organization to fetch.
     */
    where: OrganizationWhereUniqueInput
  }

  /**
   * Organization findFirst
   */
  export type OrganizationFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Organization
     */
    select?: OrganizationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Organization
     */
    omit?: OrganizationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OrganizationInclude<ExtArgs> | null
    /**
     * Filter, which Organization to fetch.
     */
    where?: OrganizationWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Organizations to fetch.
     */
    orderBy?: OrganizationOrderByWithRelationInput | OrganizationOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Organizations.
     */
    cursor?: OrganizationWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Organizations from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Organizations.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Organizations.
     */
    distinct?: OrganizationScalarFieldEnum | OrganizationScalarFieldEnum[]
  }

  /**
   * Organization findFirstOrThrow
   */
  export type OrganizationFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Organization
     */
    select?: OrganizationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Organization
     */
    omit?: OrganizationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OrganizationInclude<ExtArgs> | null
    /**
     * Filter, which Organization to fetch.
     */
    where?: OrganizationWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Organizations to fetch.
     */
    orderBy?: OrganizationOrderByWithRelationInput | OrganizationOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Organizations.
     */
    cursor?: OrganizationWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Organizations from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Organizations.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Organizations.
     */
    distinct?: OrganizationScalarFieldEnum | OrganizationScalarFieldEnum[]
  }

  /**
   * Organization findMany
   */
  export type OrganizationFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Organization
     */
    select?: OrganizationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Organization
     */
    omit?: OrganizationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OrganizationInclude<ExtArgs> | null
    /**
     * Filter, which Organizations to fetch.
     */
    where?: OrganizationWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Organizations to fetch.
     */
    orderBy?: OrganizationOrderByWithRelationInput | OrganizationOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Organizations.
     */
    cursor?: OrganizationWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Organizations from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Organizations.
     */
    skip?: number
    distinct?: OrganizationScalarFieldEnum | OrganizationScalarFieldEnum[]
  }

  /**
   * Organization create
   */
  export type OrganizationCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Organization
     */
    select?: OrganizationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Organization
     */
    omit?: OrganizationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OrganizationInclude<ExtArgs> | null
    /**
     * The data needed to create a Organization.
     */
    data: XOR<OrganizationCreateInput, OrganizationUncheckedCreateInput>
  }

  /**
   * Organization createMany
   */
  export type OrganizationCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Organizations.
     */
    data: OrganizationCreateManyInput | OrganizationCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Organization update
   */
  export type OrganizationUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Organization
     */
    select?: OrganizationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Organization
     */
    omit?: OrganizationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OrganizationInclude<ExtArgs> | null
    /**
     * The data needed to update a Organization.
     */
    data: XOR<OrganizationUpdateInput, OrganizationUncheckedUpdateInput>
    /**
     * Choose, which Organization to update.
     */
    where: OrganizationWhereUniqueInput
  }

  /**
   * Organization updateMany
   */
  export type OrganizationUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Organizations.
     */
    data: XOR<OrganizationUpdateManyMutationInput, OrganizationUncheckedUpdateManyInput>
    /**
     * Filter which Organizations to update
     */
    where?: OrganizationWhereInput
    /**
     * Limit how many Organizations to update.
     */
    limit?: number
  }

  /**
   * Organization upsert
   */
  export type OrganizationUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Organization
     */
    select?: OrganizationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Organization
     */
    omit?: OrganizationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OrganizationInclude<ExtArgs> | null
    /**
     * The filter to search for the Organization to update in case it exists.
     */
    where: OrganizationWhereUniqueInput
    /**
     * In case the Organization found by the `where` argument doesn't exist, create a new Organization with this data.
     */
    create: XOR<OrganizationCreateInput, OrganizationUncheckedCreateInput>
    /**
     * In case the Organization was found with the provided `where` argument, update it with this data.
     */
    update: XOR<OrganizationUpdateInput, OrganizationUncheckedUpdateInput>
  }

  /**
   * Organization delete
   */
  export type OrganizationDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Organization
     */
    select?: OrganizationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Organization
     */
    omit?: OrganizationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OrganizationInclude<ExtArgs> | null
    /**
     * Filter which Organization to delete.
     */
    where: OrganizationWhereUniqueInput
  }

  /**
   * Organization deleteMany
   */
  export type OrganizationDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Organizations to delete
     */
    where?: OrganizationWhereInput
    /**
     * Limit how many Organizations to delete.
     */
    limit?: number
  }

  /**
   * Organization.deptEmployments
   */
  export type Organization$deptEmploymentsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Employment
     */
    select?: EmploymentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Employment
     */
    omit?: EmploymentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EmploymentInclude<ExtArgs> | null
    where?: EmploymentWhereInput
    orderBy?: EmploymentOrderByWithRelationInput | EmploymentOrderByWithRelationInput[]
    cursor?: EmploymentWhereUniqueInput
    take?: number
    skip?: number
    distinct?: EmploymentScalarFieldEnum | EmploymentScalarFieldEnum[]
  }

  /**
   * Organization.compEmployments
   */
  export type Organization$compEmploymentsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Employment
     */
    select?: EmploymentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Employment
     */
    omit?: EmploymentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EmploymentInclude<ExtArgs> | null
    where?: EmploymentWhereInput
    orderBy?: EmploymentOrderByWithRelationInput | EmploymentOrderByWithRelationInput[]
    cursor?: EmploymentWhereUniqueInput
    take?: number
    skip?: number
    distinct?: EmploymentScalarFieldEnum | EmploymentScalarFieldEnum[]
  }

  /**
   * Organization.roles
   */
  export type Organization$rolesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OrganizationRole
     */
    select?: OrganizationRoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the OrganizationRole
     */
    omit?: OrganizationRoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OrganizationRoleInclude<ExtArgs> | null
    where?: OrganizationRoleWhereInput
    orderBy?: OrganizationRoleOrderByWithRelationInput | OrganizationRoleOrderByWithRelationInput[]
    cursor?: OrganizationRoleWhereUniqueInput
    take?: number
    skip?: number
    distinct?: OrganizationRoleScalarFieldEnum | OrganizationRoleScalarFieldEnum[]
  }

  /**
   * Organization without action
   */
  export type OrganizationDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Organization
     */
    select?: OrganizationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Organization
     */
    omit?: OrganizationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OrganizationInclude<ExtArgs> | null
  }


  /**
   * Model Position
   */

  export type AggregatePosition = {
    _count: PositionCountAggregateOutputType | null
    _avg: PositionAvgAggregateOutputType | null
    _sum: PositionSumAggregateOutputType | null
    _min: PositionMinAggregateOutputType | null
    _max: PositionMaxAggregateOutputType | null
  }

  export type PositionAvgAggregateOutputType = {
    id: number | null
    status: number | null
  }

  export type PositionSumAggregateOutputType = {
    id: number | null
    status: number | null
  }

  export type PositionMinAggregateOutputType = {
    id: number | null
    posCode: string | null
    posName: string | null
    status: number | null
    description: string | null
    isDelete: boolean | null
    createTime: Date | null
    updateTime: Date | null
  }

  export type PositionMaxAggregateOutputType = {
    id: number | null
    posCode: string | null
    posName: string | null
    status: number | null
    description: string | null
    isDelete: boolean | null
    createTime: Date | null
    updateTime: Date | null
  }

  export type PositionCountAggregateOutputType = {
    id: number
    posCode: number
    posName: number
    status: number
    description: number
    isDelete: number
    createTime: number
    updateTime: number
    _all: number
  }


  export type PositionAvgAggregateInputType = {
    id?: true
    status?: true
  }

  export type PositionSumAggregateInputType = {
    id?: true
    status?: true
  }

  export type PositionMinAggregateInputType = {
    id?: true
    posCode?: true
    posName?: true
    status?: true
    description?: true
    isDelete?: true
    createTime?: true
    updateTime?: true
  }

  export type PositionMaxAggregateInputType = {
    id?: true
    posCode?: true
    posName?: true
    status?: true
    description?: true
    isDelete?: true
    createTime?: true
    updateTime?: true
  }

  export type PositionCountAggregateInputType = {
    id?: true
    posCode?: true
    posName?: true
    status?: true
    description?: true
    isDelete?: true
    createTime?: true
    updateTime?: true
    _all?: true
  }

  export type PositionAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Position to aggregate.
     */
    where?: PositionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Positions to fetch.
     */
    orderBy?: PositionOrderByWithRelationInput | PositionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: PositionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Positions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Positions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Positions
    **/
    _count?: true | PositionCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: PositionAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: PositionSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: PositionMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: PositionMaxAggregateInputType
  }

  export type GetPositionAggregateType<T extends PositionAggregateArgs> = {
        [P in keyof T & keyof AggregatePosition]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregatePosition[P]>
      : GetScalarType<T[P], AggregatePosition[P]>
  }




  export type PositionGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: PositionWhereInput
    orderBy?: PositionOrderByWithAggregationInput | PositionOrderByWithAggregationInput[]
    by: PositionScalarFieldEnum[] | PositionScalarFieldEnum
    having?: PositionScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: PositionCountAggregateInputType | true
    _avg?: PositionAvgAggregateInputType
    _sum?: PositionSumAggregateInputType
    _min?: PositionMinAggregateInputType
    _max?: PositionMaxAggregateInputType
  }

  export type PositionGroupByOutputType = {
    id: number
    posCode: string
    posName: string
    status: number
    description: string | null
    isDelete: boolean
    createTime: Date
    updateTime: Date
    _count: PositionCountAggregateOutputType | null
    _avg: PositionAvgAggregateOutputType | null
    _sum: PositionSumAggregateOutputType | null
    _min: PositionMinAggregateOutputType | null
    _max: PositionMaxAggregateOutputType | null
  }

  type GetPositionGroupByPayload<T extends PositionGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<PositionGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof PositionGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], PositionGroupByOutputType[P]>
            : GetScalarType<T[P], PositionGroupByOutputType[P]>
        }
      >
    >


  export type PositionSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    posCode?: boolean
    posName?: boolean
    status?: boolean
    description?: boolean
    isDelete?: boolean
    createTime?: boolean
    updateTime?: boolean
    employments?: boolean | Position$employmentsArgs<ExtArgs>
    roles?: boolean | Position$rolesArgs<ExtArgs>
    _count?: boolean | PositionCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["position"]>



  export type PositionSelectScalar = {
    id?: boolean
    posCode?: boolean
    posName?: boolean
    status?: boolean
    description?: boolean
    isDelete?: boolean
    createTime?: boolean
    updateTime?: boolean
  }

  export type PositionOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "posCode" | "posName" | "status" | "description" | "isDelete" | "createTime" | "updateTime", ExtArgs["result"]["position"]>
  export type PositionInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    employments?: boolean | Position$employmentsArgs<ExtArgs>
    roles?: boolean | Position$rolesArgs<ExtArgs>
    _count?: boolean | PositionCountOutputTypeDefaultArgs<ExtArgs>
  }

  export type $PositionPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Position"
    objects: {
      employments: Prisma.$EmploymentPayload<ExtArgs>[]
      roles: Prisma.$PositionRolePayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: number
      posCode: string
      posName: string
      status: number
      description: string | null
      isDelete: boolean
      createTime: Date
      updateTime: Date
    }, ExtArgs["result"]["position"]>
    composites: {}
  }

  type PositionGetPayload<S extends boolean | null | undefined | PositionDefaultArgs> = $Result.GetResult<Prisma.$PositionPayload, S>

  type PositionCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<PositionFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: PositionCountAggregateInputType | true
    }

  export interface PositionDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Position'], meta: { name: 'Position' } }
    /**
     * Find zero or one Position that matches the filter.
     * @param {PositionFindUniqueArgs} args - Arguments to find a Position
     * @example
     * // Get one Position
     * const position = await prisma.position.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends PositionFindUniqueArgs>(args: SelectSubset<T, PositionFindUniqueArgs<ExtArgs>>): Prisma__PositionClient<$Result.GetResult<Prisma.$PositionPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Position that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {PositionFindUniqueOrThrowArgs} args - Arguments to find a Position
     * @example
     * // Get one Position
     * const position = await prisma.position.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends PositionFindUniqueOrThrowArgs>(args: SelectSubset<T, PositionFindUniqueOrThrowArgs<ExtArgs>>): Prisma__PositionClient<$Result.GetResult<Prisma.$PositionPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Position that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PositionFindFirstArgs} args - Arguments to find a Position
     * @example
     * // Get one Position
     * const position = await prisma.position.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends PositionFindFirstArgs>(args?: SelectSubset<T, PositionFindFirstArgs<ExtArgs>>): Prisma__PositionClient<$Result.GetResult<Prisma.$PositionPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Position that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PositionFindFirstOrThrowArgs} args - Arguments to find a Position
     * @example
     * // Get one Position
     * const position = await prisma.position.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends PositionFindFirstOrThrowArgs>(args?: SelectSubset<T, PositionFindFirstOrThrowArgs<ExtArgs>>): Prisma__PositionClient<$Result.GetResult<Prisma.$PositionPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Positions that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PositionFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Positions
     * const positions = await prisma.position.findMany()
     * 
     * // Get first 10 Positions
     * const positions = await prisma.position.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const positionWithIdOnly = await prisma.position.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends PositionFindManyArgs>(args?: SelectSubset<T, PositionFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$PositionPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Position.
     * @param {PositionCreateArgs} args - Arguments to create a Position.
     * @example
     * // Create one Position
     * const Position = await prisma.position.create({
     *   data: {
     *     // ... data to create a Position
     *   }
     * })
     * 
     */
    create<T extends PositionCreateArgs>(args: SelectSubset<T, PositionCreateArgs<ExtArgs>>): Prisma__PositionClient<$Result.GetResult<Prisma.$PositionPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Positions.
     * @param {PositionCreateManyArgs} args - Arguments to create many Positions.
     * @example
     * // Create many Positions
     * const position = await prisma.position.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends PositionCreateManyArgs>(args?: SelectSubset<T, PositionCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Delete a Position.
     * @param {PositionDeleteArgs} args - Arguments to delete one Position.
     * @example
     * // Delete one Position
     * const Position = await prisma.position.delete({
     *   where: {
     *     // ... filter to delete one Position
     *   }
     * })
     * 
     */
    delete<T extends PositionDeleteArgs>(args: SelectSubset<T, PositionDeleteArgs<ExtArgs>>): Prisma__PositionClient<$Result.GetResult<Prisma.$PositionPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Position.
     * @param {PositionUpdateArgs} args - Arguments to update one Position.
     * @example
     * // Update one Position
     * const position = await prisma.position.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends PositionUpdateArgs>(args: SelectSubset<T, PositionUpdateArgs<ExtArgs>>): Prisma__PositionClient<$Result.GetResult<Prisma.$PositionPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Positions.
     * @param {PositionDeleteManyArgs} args - Arguments to filter Positions to delete.
     * @example
     * // Delete a few Positions
     * const { count } = await prisma.position.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends PositionDeleteManyArgs>(args?: SelectSubset<T, PositionDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Positions.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PositionUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Positions
     * const position = await prisma.position.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends PositionUpdateManyArgs>(args: SelectSubset<T, PositionUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one Position.
     * @param {PositionUpsertArgs} args - Arguments to update or create a Position.
     * @example
     * // Update or create a Position
     * const position = await prisma.position.upsert({
     *   create: {
     *     // ... data to create a Position
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Position we want to update
     *   }
     * })
     */
    upsert<T extends PositionUpsertArgs>(args: SelectSubset<T, PositionUpsertArgs<ExtArgs>>): Prisma__PositionClient<$Result.GetResult<Prisma.$PositionPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Positions.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PositionCountArgs} args - Arguments to filter Positions to count.
     * @example
     * // Count the number of Positions
     * const count = await prisma.position.count({
     *   where: {
     *     // ... the filter for the Positions we want to count
     *   }
     * })
    **/
    count<T extends PositionCountArgs>(
      args?: Subset<T, PositionCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], PositionCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Position.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PositionAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends PositionAggregateArgs>(args: Subset<T, PositionAggregateArgs>): Prisma.PrismaPromise<GetPositionAggregateType<T>>

    /**
     * Group by Position.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PositionGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends PositionGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: PositionGroupByArgs['orderBy'] }
        : { orderBy?: PositionGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, PositionGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetPositionGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Position model
   */
  readonly fields: PositionFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Position.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__PositionClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    employments<T extends Position$employmentsArgs<ExtArgs> = {}>(args?: Subset<T, Position$employmentsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$EmploymentPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    roles<T extends Position$rolesArgs<ExtArgs> = {}>(args?: Subset<T, Position$rolesArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$PositionRolePayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Position model
   */
  interface PositionFieldRefs {
    readonly id: FieldRef<"Position", 'Int'>
    readonly posCode: FieldRef<"Position", 'String'>
    readonly posName: FieldRef<"Position", 'String'>
    readonly status: FieldRef<"Position", 'Int'>
    readonly description: FieldRef<"Position", 'String'>
    readonly isDelete: FieldRef<"Position", 'Boolean'>
    readonly createTime: FieldRef<"Position", 'DateTime'>
    readonly updateTime: FieldRef<"Position", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Position findUnique
   */
  export type PositionFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Position
     */
    select?: PositionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Position
     */
    omit?: PositionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PositionInclude<ExtArgs> | null
    /**
     * Filter, which Position to fetch.
     */
    where: PositionWhereUniqueInput
  }

  /**
   * Position findUniqueOrThrow
   */
  export type PositionFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Position
     */
    select?: PositionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Position
     */
    omit?: PositionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PositionInclude<ExtArgs> | null
    /**
     * Filter, which Position to fetch.
     */
    where: PositionWhereUniqueInput
  }

  /**
   * Position findFirst
   */
  export type PositionFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Position
     */
    select?: PositionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Position
     */
    omit?: PositionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PositionInclude<ExtArgs> | null
    /**
     * Filter, which Position to fetch.
     */
    where?: PositionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Positions to fetch.
     */
    orderBy?: PositionOrderByWithRelationInput | PositionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Positions.
     */
    cursor?: PositionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Positions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Positions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Positions.
     */
    distinct?: PositionScalarFieldEnum | PositionScalarFieldEnum[]
  }

  /**
   * Position findFirstOrThrow
   */
  export type PositionFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Position
     */
    select?: PositionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Position
     */
    omit?: PositionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PositionInclude<ExtArgs> | null
    /**
     * Filter, which Position to fetch.
     */
    where?: PositionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Positions to fetch.
     */
    orderBy?: PositionOrderByWithRelationInput | PositionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Positions.
     */
    cursor?: PositionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Positions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Positions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Positions.
     */
    distinct?: PositionScalarFieldEnum | PositionScalarFieldEnum[]
  }

  /**
   * Position findMany
   */
  export type PositionFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Position
     */
    select?: PositionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Position
     */
    omit?: PositionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PositionInclude<ExtArgs> | null
    /**
     * Filter, which Positions to fetch.
     */
    where?: PositionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Positions to fetch.
     */
    orderBy?: PositionOrderByWithRelationInput | PositionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Positions.
     */
    cursor?: PositionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Positions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Positions.
     */
    skip?: number
    distinct?: PositionScalarFieldEnum | PositionScalarFieldEnum[]
  }

  /**
   * Position create
   */
  export type PositionCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Position
     */
    select?: PositionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Position
     */
    omit?: PositionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PositionInclude<ExtArgs> | null
    /**
     * The data needed to create a Position.
     */
    data: XOR<PositionCreateInput, PositionUncheckedCreateInput>
  }

  /**
   * Position createMany
   */
  export type PositionCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Positions.
     */
    data: PositionCreateManyInput | PositionCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Position update
   */
  export type PositionUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Position
     */
    select?: PositionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Position
     */
    omit?: PositionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PositionInclude<ExtArgs> | null
    /**
     * The data needed to update a Position.
     */
    data: XOR<PositionUpdateInput, PositionUncheckedUpdateInput>
    /**
     * Choose, which Position to update.
     */
    where: PositionWhereUniqueInput
  }

  /**
   * Position updateMany
   */
  export type PositionUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Positions.
     */
    data: XOR<PositionUpdateManyMutationInput, PositionUncheckedUpdateManyInput>
    /**
     * Filter which Positions to update
     */
    where?: PositionWhereInput
    /**
     * Limit how many Positions to update.
     */
    limit?: number
  }

  /**
   * Position upsert
   */
  export type PositionUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Position
     */
    select?: PositionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Position
     */
    omit?: PositionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PositionInclude<ExtArgs> | null
    /**
     * The filter to search for the Position to update in case it exists.
     */
    where: PositionWhereUniqueInput
    /**
     * In case the Position found by the `where` argument doesn't exist, create a new Position with this data.
     */
    create: XOR<PositionCreateInput, PositionUncheckedCreateInput>
    /**
     * In case the Position was found with the provided `where` argument, update it with this data.
     */
    update: XOR<PositionUpdateInput, PositionUncheckedUpdateInput>
  }

  /**
   * Position delete
   */
  export type PositionDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Position
     */
    select?: PositionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Position
     */
    omit?: PositionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PositionInclude<ExtArgs> | null
    /**
     * Filter which Position to delete.
     */
    where: PositionWhereUniqueInput
  }

  /**
   * Position deleteMany
   */
  export type PositionDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Positions to delete
     */
    where?: PositionWhereInput
    /**
     * Limit how many Positions to delete.
     */
    limit?: number
  }

  /**
   * Position.employments
   */
  export type Position$employmentsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Employment
     */
    select?: EmploymentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Employment
     */
    omit?: EmploymentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EmploymentInclude<ExtArgs> | null
    where?: EmploymentWhereInput
    orderBy?: EmploymentOrderByWithRelationInput | EmploymentOrderByWithRelationInput[]
    cursor?: EmploymentWhereUniqueInput
    take?: number
    skip?: number
    distinct?: EmploymentScalarFieldEnum | EmploymentScalarFieldEnum[]
  }

  /**
   * Position.roles
   */
  export type Position$rolesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PositionRole
     */
    select?: PositionRoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the PositionRole
     */
    omit?: PositionRoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PositionRoleInclude<ExtArgs> | null
    where?: PositionRoleWhereInput
    orderBy?: PositionRoleOrderByWithRelationInput | PositionRoleOrderByWithRelationInput[]
    cursor?: PositionRoleWhereUniqueInput
    take?: number
    skip?: number
    distinct?: PositionRoleScalarFieldEnum | PositionRoleScalarFieldEnum[]
  }

  /**
   * Position without action
   */
  export type PositionDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Position
     */
    select?: PositionSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Position
     */
    omit?: PositionOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PositionInclude<ExtArgs> | null
  }


  /**
   * Model Employment
   */

  export type AggregateEmployment = {
    _count: EmploymentCountAggregateOutputType | null
    _avg: EmploymentAvgAggregateOutputType | null
    _sum: EmploymentSumAggregateOutputType | null
    _min: EmploymentMinAggregateOutputType | null
    _max: EmploymentMaxAggregateOutputType | null
  }

  export type EmploymentAvgAggregateOutputType = {
    id: number | null
    userId: number | null
    posId: number | null
    deptId: number | null
    compId: number | null
    status: number | null
  }

  export type EmploymentSumAggregateOutputType = {
    id: number | null
    userId: number | null
    posId: number | null
    deptId: number | null
    compId: number | null
    status: number | null
  }

  export type EmploymentMinAggregateOutputType = {
    id: number | null
    userId: number | null
    posId: number | null
    deptId: number | null
    compId: number | null
    status: number | null
    description: string | null
    isDelete: boolean | null
    createTime: Date | null
    updateTime: Date | null
  }

  export type EmploymentMaxAggregateOutputType = {
    id: number | null
    userId: number | null
    posId: number | null
    deptId: number | null
    compId: number | null
    status: number | null
    description: string | null
    isDelete: boolean | null
    createTime: Date | null
    updateTime: Date | null
  }

  export type EmploymentCountAggregateOutputType = {
    id: number
    userId: number
    posId: number
    deptId: number
    compId: number
    status: number
    description: number
    isDelete: number
    createTime: number
    updateTime: number
    _all: number
  }


  export type EmploymentAvgAggregateInputType = {
    id?: true
    userId?: true
    posId?: true
    deptId?: true
    compId?: true
    status?: true
  }

  export type EmploymentSumAggregateInputType = {
    id?: true
    userId?: true
    posId?: true
    deptId?: true
    compId?: true
    status?: true
  }

  export type EmploymentMinAggregateInputType = {
    id?: true
    userId?: true
    posId?: true
    deptId?: true
    compId?: true
    status?: true
    description?: true
    isDelete?: true
    createTime?: true
    updateTime?: true
  }

  export type EmploymentMaxAggregateInputType = {
    id?: true
    userId?: true
    posId?: true
    deptId?: true
    compId?: true
    status?: true
    description?: true
    isDelete?: true
    createTime?: true
    updateTime?: true
  }

  export type EmploymentCountAggregateInputType = {
    id?: true
    userId?: true
    posId?: true
    deptId?: true
    compId?: true
    status?: true
    description?: true
    isDelete?: true
    createTime?: true
    updateTime?: true
    _all?: true
  }

  export type EmploymentAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Employment to aggregate.
     */
    where?: EmploymentWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Employments to fetch.
     */
    orderBy?: EmploymentOrderByWithRelationInput | EmploymentOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: EmploymentWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Employments from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Employments.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Employments
    **/
    _count?: true | EmploymentCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: EmploymentAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: EmploymentSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: EmploymentMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: EmploymentMaxAggregateInputType
  }

  export type GetEmploymentAggregateType<T extends EmploymentAggregateArgs> = {
        [P in keyof T & keyof AggregateEmployment]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateEmployment[P]>
      : GetScalarType<T[P], AggregateEmployment[P]>
  }




  export type EmploymentGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: EmploymentWhereInput
    orderBy?: EmploymentOrderByWithAggregationInput | EmploymentOrderByWithAggregationInput[]
    by: EmploymentScalarFieldEnum[] | EmploymentScalarFieldEnum
    having?: EmploymentScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: EmploymentCountAggregateInputType | true
    _avg?: EmploymentAvgAggregateInputType
    _sum?: EmploymentSumAggregateInputType
    _min?: EmploymentMinAggregateInputType
    _max?: EmploymentMaxAggregateInputType
  }

  export type EmploymentGroupByOutputType = {
    id: number
    userId: number
    posId: number
    deptId: number
    compId: number
    status: number
    description: string | null
    isDelete: boolean
    createTime: Date
    updateTime: Date
    _count: EmploymentCountAggregateOutputType | null
    _avg: EmploymentAvgAggregateOutputType | null
    _sum: EmploymentSumAggregateOutputType | null
    _min: EmploymentMinAggregateOutputType | null
    _max: EmploymentMaxAggregateOutputType | null
  }

  type GetEmploymentGroupByPayload<T extends EmploymentGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<EmploymentGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof EmploymentGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], EmploymentGroupByOutputType[P]>
            : GetScalarType<T[P], EmploymentGroupByOutputType[P]>
        }
      >
    >


  export type EmploymentSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    userId?: boolean
    posId?: boolean
    deptId?: boolean
    compId?: boolean
    status?: boolean
    description?: boolean
    isDelete?: boolean
    createTime?: boolean
    updateTime?: boolean
    user?: boolean | UserDefaultArgs<ExtArgs>
    deptartment?: boolean | OrganizationDefaultArgs<ExtArgs>
    company?: boolean | OrganizationDefaultArgs<ExtArgs>
    position?: boolean | PositionDefaultArgs<ExtArgs>
    roles?: boolean | Employment$rolesArgs<ExtArgs>
    _count?: boolean | EmploymentCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["employment"]>



  export type EmploymentSelectScalar = {
    id?: boolean
    userId?: boolean
    posId?: boolean
    deptId?: boolean
    compId?: boolean
    status?: boolean
    description?: boolean
    isDelete?: boolean
    createTime?: boolean
    updateTime?: boolean
  }

  export type EmploymentOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "userId" | "posId" | "deptId" | "compId" | "status" | "description" | "isDelete" | "createTime" | "updateTime", ExtArgs["result"]["employment"]>
  export type EmploymentInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    user?: boolean | UserDefaultArgs<ExtArgs>
    deptartment?: boolean | OrganizationDefaultArgs<ExtArgs>
    company?: boolean | OrganizationDefaultArgs<ExtArgs>
    position?: boolean | PositionDefaultArgs<ExtArgs>
    roles?: boolean | Employment$rolesArgs<ExtArgs>
    _count?: boolean | EmploymentCountOutputTypeDefaultArgs<ExtArgs>
  }

  export type $EmploymentPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Employment"
    objects: {
      user: Prisma.$UserPayload<ExtArgs>
      deptartment: Prisma.$OrganizationPayload<ExtArgs>
      company: Prisma.$OrganizationPayload<ExtArgs>
      position: Prisma.$PositionPayload<ExtArgs>
      roles: Prisma.$EmploymentRolePayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: number
      userId: number
      posId: number
      deptId: number
      compId: number
      status: number
      description: string | null
      isDelete: boolean
      createTime: Date
      updateTime: Date
    }, ExtArgs["result"]["employment"]>
    composites: {}
  }

  type EmploymentGetPayload<S extends boolean | null | undefined | EmploymentDefaultArgs> = $Result.GetResult<Prisma.$EmploymentPayload, S>

  type EmploymentCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<EmploymentFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: EmploymentCountAggregateInputType | true
    }

  export interface EmploymentDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Employment'], meta: { name: 'Employment' } }
    /**
     * Find zero or one Employment that matches the filter.
     * @param {EmploymentFindUniqueArgs} args - Arguments to find a Employment
     * @example
     * // Get one Employment
     * const employment = await prisma.employment.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends EmploymentFindUniqueArgs>(args: SelectSubset<T, EmploymentFindUniqueArgs<ExtArgs>>): Prisma__EmploymentClient<$Result.GetResult<Prisma.$EmploymentPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Employment that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {EmploymentFindUniqueOrThrowArgs} args - Arguments to find a Employment
     * @example
     * // Get one Employment
     * const employment = await prisma.employment.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends EmploymentFindUniqueOrThrowArgs>(args: SelectSubset<T, EmploymentFindUniqueOrThrowArgs<ExtArgs>>): Prisma__EmploymentClient<$Result.GetResult<Prisma.$EmploymentPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Employment that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EmploymentFindFirstArgs} args - Arguments to find a Employment
     * @example
     * // Get one Employment
     * const employment = await prisma.employment.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends EmploymentFindFirstArgs>(args?: SelectSubset<T, EmploymentFindFirstArgs<ExtArgs>>): Prisma__EmploymentClient<$Result.GetResult<Prisma.$EmploymentPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Employment that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EmploymentFindFirstOrThrowArgs} args - Arguments to find a Employment
     * @example
     * // Get one Employment
     * const employment = await prisma.employment.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends EmploymentFindFirstOrThrowArgs>(args?: SelectSubset<T, EmploymentFindFirstOrThrowArgs<ExtArgs>>): Prisma__EmploymentClient<$Result.GetResult<Prisma.$EmploymentPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Employments that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EmploymentFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Employments
     * const employments = await prisma.employment.findMany()
     * 
     * // Get first 10 Employments
     * const employments = await prisma.employment.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const employmentWithIdOnly = await prisma.employment.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends EmploymentFindManyArgs>(args?: SelectSubset<T, EmploymentFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$EmploymentPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Employment.
     * @param {EmploymentCreateArgs} args - Arguments to create a Employment.
     * @example
     * // Create one Employment
     * const Employment = await prisma.employment.create({
     *   data: {
     *     // ... data to create a Employment
     *   }
     * })
     * 
     */
    create<T extends EmploymentCreateArgs>(args: SelectSubset<T, EmploymentCreateArgs<ExtArgs>>): Prisma__EmploymentClient<$Result.GetResult<Prisma.$EmploymentPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Employments.
     * @param {EmploymentCreateManyArgs} args - Arguments to create many Employments.
     * @example
     * // Create many Employments
     * const employment = await prisma.employment.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends EmploymentCreateManyArgs>(args?: SelectSubset<T, EmploymentCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Delete a Employment.
     * @param {EmploymentDeleteArgs} args - Arguments to delete one Employment.
     * @example
     * // Delete one Employment
     * const Employment = await prisma.employment.delete({
     *   where: {
     *     // ... filter to delete one Employment
     *   }
     * })
     * 
     */
    delete<T extends EmploymentDeleteArgs>(args: SelectSubset<T, EmploymentDeleteArgs<ExtArgs>>): Prisma__EmploymentClient<$Result.GetResult<Prisma.$EmploymentPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Employment.
     * @param {EmploymentUpdateArgs} args - Arguments to update one Employment.
     * @example
     * // Update one Employment
     * const employment = await prisma.employment.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends EmploymentUpdateArgs>(args: SelectSubset<T, EmploymentUpdateArgs<ExtArgs>>): Prisma__EmploymentClient<$Result.GetResult<Prisma.$EmploymentPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Employments.
     * @param {EmploymentDeleteManyArgs} args - Arguments to filter Employments to delete.
     * @example
     * // Delete a few Employments
     * const { count } = await prisma.employment.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends EmploymentDeleteManyArgs>(args?: SelectSubset<T, EmploymentDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Employments.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EmploymentUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Employments
     * const employment = await prisma.employment.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends EmploymentUpdateManyArgs>(args: SelectSubset<T, EmploymentUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one Employment.
     * @param {EmploymentUpsertArgs} args - Arguments to update or create a Employment.
     * @example
     * // Update or create a Employment
     * const employment = await prisma.employment.upsert({
     *   create: {
     *     // ... data to create a Employment
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Employment we want to update
     *   }
     * })
     */
    upsert<T extends EmploymentUpsertArgs>(args: SelectSubset<T, EmploymentUpsertArgs<ExtArgs>>): Prisma__EmploymentClient<$Result.GetResult<Prisma.$EmploymentPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Employments.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EmploymentCountArgs} args - Arguments to filter Employments to count.
     * @example
     * // Count the number of Employments
     * const count = await prisma.employment.count({
     *   where: {
     *     // ... the filter for the Employments we want to count
     *   }
     * })
    **/
    count<T extends EmploymentCountArgs>(
      args?: Subset<T, EmploymentCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], EmploymentCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Employment.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EmploymentAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends EmploymentAggregateArgs>(args: Subset<T, EmploymentAggregateArgs>): Prisma.PrismaPromise<GetEmploymentAggregateType<T>>

    /**
     * Group by Employment.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EmploymentGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends EmploymentGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: EmploymentGroupByArgs['orderBy'] }
        : { orderBy?: EmploymentGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, EmploymentGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetEmploymentGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Employment model
   */
  readonly fields: EmploymentFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Employment.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__EmploymentClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    user<T extends UserDefaultArgs<ExtArgs> = {}>(args?: Subset<T, UserDefaultArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    deptartment<T extends OrganizationDefaultArgs<ExtArgs> = {}>(args?: Subset<T, OrganizationDefaultArgs<ExtArgs>>): Prisma__OrganizationClient<$Result.GetResult<Prisma.$OrganizationPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    company<T extends OrganizationDefaultArgs<ExtArgs> = {}>(args?: Subset<T, OrganizationDefaultArgs<ExtArgs>>): Prisma__OrganizationClient<$Result.GetResult<Prisma.$OrganizationPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    position<T extends PositionDefaultArgs<ExtArgs> = {}>(args?: Subset<T, PositionDefaultArgs<ExtArgs>>): Prisma__PositionClient<$Result.GetResult<Prisma.$PositionPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    roles<T extends Employment$rolesArgs<ExtArgs> = {}>(args?: Subset<T, Employment$rolesArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$EmploymentRolePayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Employment model
   */
  interface EmploymentFieldRefs {
    readonly id: FieldRef<"Employment", 'Int'>
    readonly userId: FieldRef<"Employment", 'Int'>
    readonly posId: FieldRef<"Employment", 'Int'>
    readonly deptId: FieldRef<"Employment", 'Int'>
    readonly compId: FieldRef<"Employment", 'Int'>
    readonly status: FieldRef<"Employment", 'Int'>
    readonly description: FieldRef<"Employment", 'String'>
    readonly isDelete: FieldRef<"Employment", 'Boolean'>
    readonly createTime: FieldRef<"Employment", 'DateTime'>
    readonly updateTime: FieldRef<"Employment", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Employment findUnique
   */
  export type EmploymentFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Employment
     */
    select?: EmploymentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Employment
     */
    omit?: EmploymentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EmploymentInclude<ExtArgs> | null
    /**
     * Filter, which Employment to fetch.
     */
    where: EmploymentWhereUniqueInput
  }

  /**
   * Employment findUniqueOrThrow
   */
  export type EmploymentFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Employment
     */
    select?: EmploymentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Employment
     */
    omit?: EmploymentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EmploymentInclude<ExtArgs> | null
    /**
     * Filter, which Employment to fetch.
     */
    where: EmploymentWhereUniqueInput
  }

  /**
   * Employment findFirst
   */
  export type EmploymentFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Employment
     */
    select?: EmploymentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Employment
     */
    omit?: EmploymentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EmploymentInclude<ExtArgs> | null
    /**
     * Filter, which Employment to fetch.
     */
    where?: EmploymentWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Employments to fetch.
     */
    orderBy?: EmploymentOrderByWithRelationInput | EmploymentOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Employments.
     */
    cursor?: EmploymentWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Employments from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Employments.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Employments.
     */
    distinct?: EmploymentScalarFieldEnum | EmploymentScalarFieldEnum[]
  }

  /**
   * Employment findFirstOrThrow
   */
  export type EmploymentFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Employment
     */
    select?: EmploymentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Employment
     */
    omit?: EmploymentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EmploymentInclude<ExtArgs> | null
    /**
     * Filter, which Employment to fetch.
     */
    where?: EmploymentWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Employments to fetch.
     */
    orderBy?: EmploymentOrderByWithRelationInput | EmploymentOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Employments.
     */
    cursor?: EmploymentWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Employments from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Employments.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Employments.
     */
    distinct?: EmploymentScalarFieldEnum | EmploymentScalarFieldEnum[]
  }

  /**
   * Employment findMany
   */
  export type EmploymentFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Employment
     */
    select?: EmploymentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Employment
     */
    omit?: EmploymentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EmploymentInclude<ExtArgs> | null
    /**
     * Filter, which Employments to fetch.
     */
    where?: EmploymentWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Employments to fetch.
     */
    orderBy?: EmploymentOrderByWithRelationInput | EmploymentOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Employments.
     */
    cursor?: EmploymentWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Employments from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Employments.
     */
    skip?: number
    distinct?: EmploymentScalarFieldEnum | EmploymentScalarFieldEnum[]
  }

  /**
   * Employment create
   */
  export type EmploymentCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Employment
     */
    select?: EmploymentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Employment
     */
    omit?: EmploymentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EmploymentInclude<ExtArgs> | null
    /**
     * The data needed to create a Employment.
     */
    data: XOR<EmploymentCreateInput, EmploymentUncheckedCreateInput>
  }

  /**
   * Employment createMany
   */
  export type EmploymentCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Employments.
     */
    data: EmploymentCreateManyInput | EmploymentCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Employment update
   */
  export type EmploymentUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Employment
     */
    select?: EmploymentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Employment
     */
    omit?: EmploymentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EmploymentInclude<ExtArgs> | null
    /**
     * The data needed to update a Employment.
     */
    data: XOR<EmploymentUpdateInput, EmploymentUncheckedUpdateInput>
    /**
     * Choose, which Employment to update.
     */
    where: EmploymentWhereUniqueInput
  }

  /**
   * Employment updateMany
   */
  export type EmploymentUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Employments.
     */
    data: XOR<EmploymentUpdateManyMutationInput, EmploymentUncheckedUpdateManyInput>
    /**
     * Filter which Employments to update
     */
    where?: EmploymentWhereInput
    /**
     * Limit how many Employments to update.
     */
    limit?: number
  }

  /**
   * Employment upsert
   */
  export type EmploymentUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Employment
     */
    select?: EmploymentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Employment
     */
    omit?: EmploymentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EmploymentInclude<ExtArgs> | null
    /**
     * The filter to search for the Employment to update in case it exists.
     */
    where: EmploymentWhereUniqueInput
    /**
     * In case the Employment found by the `where` argument doesn't exist, create a new Employment with this data.
     */
    create: XOR<EmploymentCreateInput, EmploymentUncheckedCreateInput>
    /**
     * In case the Employment was found with the provided `where` argument, update it with this data.
     */
    update: XOR<EmploymentUpdateInput, EmploymentUncheckedUpdateInput>
  }

  /**
   * Employment delete
   */
  export type EmploymentDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Employment
     */
    select?: EmploymentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Employment
     */
    omit?: EmploymentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EmploymentInclude<ExtArgs> | null
    /**
     * Filter which Employment to delete.
     */
    where: EmploymentWhereUniqueInput
  }

  /**
   * Employment deleteMany
   */
  export type EmploymentDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Employments to delete
     */
    where?: EmploymentWhereInput
    /**
     * Limit how many Employments to delete.
     */
    limit?: number
  }

  /**
   * Employment.roles
   */
  export type Employment$rolesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EmploymentRole
     */
    select?: EmploymentRoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the EmploymentRole
     */
    omit?: EmploymentRoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EmploymentRoleInclude<ExtArgs> | null
    where?: EmploymentRoleWhereInput
    orderBy?: EmploymentRoleOrderByWithRelationInput | EmploymentRoleOrderByWithRelationInput[]
    cursor?: EmploymentRoleWhereUniqueInput
    take?: number
    skip?: number
    distinct?: EmploymentRoleScalarFieldEnum | EmploymentRoleScalarFieldEnum[]
  }

  /**
   * Employment without action
   */
  export type EmploymentDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Employment
     */
    select?: EmploymentSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Employment
     */
    omit?: EmploymentOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EmploymentInclude<ExtArgs> | null
  }


  /**
   * Model Client
   */

  export type AggregateClient = {
    _count: ClientCountAggregateOutputType | null
    _avg: ClientAvgAggregateOutputType | null
    _sum: ClientSumAggregateOutputType | null
    _min: ClientMinAggregateOutputType | null
    _max: ClientMaxAggregateOutputType | null
  }

  export type ClientAvgAggregateOutputType = {
    id: number | null
    status: number | null
  }

  export type ClientSumAggregateOutputType = {
    id: number | null
    status: number | null
  }

  export type ClientMinAggregateOutputType = {
    id: number | null
    clientCode: string | null
    clientName: string | null
    status: number | null
    description: string | null
    isDelete: boolean | null
    createTime: Date | null
    updateTime: Date | null
  }

  export type ClientMaxAggregateOutputType = {
    id: number | null
    clientCode: string | null
    clientName: string | null
    status: number | null
    description: string | null
    isDelete: boolean | null
    createTime: Date | null
    updateTime: Date | null
  }

  export type ClientCountAggregateOutputType = {
    id: number
    clientCode: number
    clientName: number
    status: number
    description: number
    isDelete: number
    createTime: number
    updateTime: number
    _all: number
  }


  export type ClientAvgAggregateInputType = {
    id?: true
    status?: true
  }

  export type ClientSumAggregateInputType = {
    id?: true
    status?: true
  }

  export type ClientMinAggregateInputType = {
    id?: true
    clientCode?: true
    clientName?: true
    status?: true
    description?: true
    isDelete?: true
    createTime?: true
    updateTime?: true
  }

  export type ClientMaxAggregateInputType = {
    id?: true
    clientCode?: true
    clientName?: true
    status?: true
    description?: true
    isDelete?: true
    createTime?: true
    updateTime?: true
  }

  export type ClientCountAggregateInputType = {
    id?: true
    clientCode?: true
    clientName?: true
    status?: true
    description?: true
    isDelete?: true
    createTime?: true
    updateTime?: true
    _all?: true
  }

  export type ClientAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Client to aggregate.
     */
    where?: ClientWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Clients to fetch.
     */
    orderBy?: ClientOrderByWithRelationInput | ClientOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: ClientWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Clients from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Clients.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Clients
    **/
    _count?: true | ClientCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: ClientAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: ClientSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: ClientMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: ClientMaxAggregateInputType
  }

  export type GetClientAggregateType<T extends ClientAggregateArgs> = {
        [P in keyof T & keyof AggregateClient]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateClient[P]>
      : GetScalarType<T[P], AggregateClient[P]>
  }




  export type ClientGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ClientWhereInput
    orderBy?: ClientOrderByWithAggregationInput | ClientOrderByWithAggregationInput[]
    by: ClientScalarFieldEnum[] | ClientScalarFieldEnum
    having?: ClientScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: ClientCountAggregateInputType | true
    _avg?: ClientAvgAggregateInputType
    _sum?: ClientSumAggregateInputType
    _min?: ClientMinAggregateInputType
    _max?: ClientMaxAggregateInputType
  }

  export type ClientGroupByOutputType = {
    id: number
    clientCode: string
    clientName: string
    status: number
    description: string | null
    isDelete: boolean
    createTime: Date
    updateTime: Date
    _count: ClientCountAggregateOutputType | null
    _avg: ClientAvgAggregateOutputType | null
    _sum: ClientSumAggregateOutputType | null
    _min: ClientMinAggregateOutputType | null
    _max: ClientMaxAggregateOutputType | null
  }

  type GetClientGroupByPayload<T extends ClientGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<ClientGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof ClientGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], ClientGroupByOutputType[P]>
            : GetScalarType<T[P], ClientGroupByOutputType[P]>
        }
      >
    >


  export type ClientSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    clientCode?: boolean
    clientName?: boolean
    status?: boolean
    description?: boolean
    isDelete?: boolean
    createTime?: boolean
    updateTime?: boolean
    role?: boolean | Client$roleArgs<ExtArgs>
    _count?: boolean | ClientCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["client"]>



  export type ClientSelectScalar = {
    id?: boolean
    clientCode?: boolean
    clientName?: boolean
    status?: boolean
    description?: boolean
    isDelete?: boolean
    createTime?: boolean
    updateTime?: boolean
  }

  export type ClientOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "clientCode" | "clientName" | "status" | "description" | "isDelete" | "createTime" | "updateTime", ExtArgs["result"]["client"]>
  export type ClientInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    role?: boolean | Client$roleArgs<ExtArgs>
    _count?: boolean | ClientCountOutputTypeDefaultArgs<ExtArgs>
  }

  export type $ClientPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Client"
    objects: {
      role: Prisma.$RolePayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: number
      clientCode: string
      clientName: string
      status: number
      description: string | null
      isDelete: boolean
      createTime: Date
      updateTime: Date
    }, ExtArgs["result"]["client"]>
    composites: {}
  }

  type ClientGetPayload<S extends boolean | null | undefined | ClientDefaultArgs> = $Result.GetResult<Prisma.$ClientPayload, S>

  type ClientCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<ClientFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: ClientCountAggregateInputType | true
    }

  export interface ClientDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Client'], meta: { name: 'Client' } }
    /**
     * Find zero or one Client that matches the filter.
     * @param {ClientFindUniqueArgs} args - Arguments to find a Client
     * @example
     * // Get one Client
     * const client = await prisma.client.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends ClientFindUniqueArgs>(args: SelectSubset<T, ClientFindUniqueArgs<ExtArgs>>): Prisma__ClientClient<$Result.GetResult<Prisma.$ClientPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Client that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {ClientFindUniqueOrThrowArgs} args - Arguments to find a Client
     * @example
     * // Get one Client
     * const client = await prisma.client.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends ClientFindUniqueOrThrowArgs>(args: SelectSubset<T, ClientFindUniqueOrThrowArgs<ExtArgs>>): Prisma__ClientClient<$Result.GetResult<Prisma.$ClientPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Client that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ClientFindFirstArgs} args - Arguments to find a Client
     * @example
     * // Get one Client
     * const client = await prisma.client.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends ClientFindFirstArgs>(args?: SelectSubset<T, ClientFindFirstArgs<ExtArgs>>): Prisma__ClientClient<$Result.GetResult<Prisma.$ClientPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Client that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ClientFindFirstOrThrowArgs} args - Arguments to find a Client
     * @example
     * // Get one Client
     * const client = await prisma.client.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends ClientFindFirstOrThrowArgs>(args?: SelectSubset<T, ClientFindFirstOrThrowArgs<ExtArgs>>): Prisma__ClientClient<$Result.GetResult<Prisma.$ClientPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Clients that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ClientFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Clients
     * const clients = await prisma.client.findMany()
     * 
     * // Get first 10 Clients
     * const clients = await prisma.client.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const clientWithIdOnly = await prisma.client.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends ClientFindManyArgs>(args?: SelectSubset<T, ClientFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ClientPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Client.
     * @param {ClientCreateArgs} args - Arguments to create a Client.
     * @example
     * // Create one Client
     * const Client = await prisma.client.create({
     *   data: {
     *     // ... data to create a Client
     *   }
     * })
     * 
     */
    create<T extends ClientCreateArgs>(args: SelectSubset<T, ClientCreateArgs<ExtArgs>>): Prisma__ClientClient<$Result.GetResult<Prisma.$ClientPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Clients.
     * @param {ClientCreateManyArgs} args - Arguments to create many Clients.
     * @example
     * // Create many Clients
     * const client = await prisma.client.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends ClientCreateManyArgs>(args?: SelectSubset<T, ClientCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Delete a Client.
     * @param {ClientDeleteArgs} args - Arguments to delete one Client.
     * @example
     * // Delete one Client
     * const Client = await prisma.client.delete({
     *   where: {
     *     // ... filter to delete one Client
     *   }
     * })
     * 
     */
    delete<T extends ClientDeleteArgs>(args: SelectSubset<T, ClientDeleteArgs<ExtArgs>>): Prisma__ClientClient<$Result.GetResult<Prisma.$ClientPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Client.
     * @param {ClientUpdateArgs} args - Arguments to update one Client.
     * @example
     * // Update one Client
     * const client = await prisma.client.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends ClientUpdateArgs>(args: SelectSubset<T, ClientUpdateArgs<ExtArgs>>): Prisma__ClientClient<$Result.GetResult<Prisma.$ClientPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Clients.
     * @param {ClientDeleteManyArgs} args - Arguments to filter Clients to delete.
     * @example
     * // Delete a few Clients
     * const { count } = await prisma.client.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends ClientDeleteManyArgs>(args?: SelectSubset<T, ClientDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Clients.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ClientUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Clients
     * const client = await prisma.client.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends ClientUpdateManyArgs>(args: SelectSubset<T, ClientUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one Client.
     * @param {ClientUpsertArgs} args - Arguments to update or create a Client.
     * @example
     * // Update or create a Client
     * const client = await prisma.client.upsert({
     *   create: {
     *     // ... data to create a Client
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Client we want to update
     *   }
     * })
     */
    upsert<T extends ClientUpsertArgs>(args: SelectSubset<T, ClientUpsertArgs<ExtArgs>>): Prisma__ClientClient<$Result.GetResult<Prisma.$ClientPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Clients.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ClientCountArgs} args - Arguments to filter Clients to count.
     * @example
     * // Count the number of Clients
     * const count = await prisma.client.count({
     *   where: {
     *     // ... the filter for the Clients we want to count
     *   }
     * })
    **/
    count<T extends ClientCountArgs>(
      args?: Subset<T, ClientCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], ClientCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Client.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ClientAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends ClientAggregateArgs>(args: Subset<T, ClientAggregateArgs>): Prisma.PrismaPromise<GetClientAggregateType<T>>

    /**
     * Group by Client.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ClientGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends ClientGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: ClientGroupByArgs['orderBy'] }
        : { orderBy?: ClientGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, ClientGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetClientGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Client model
   */
  readonly fields: ClientFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Client.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__ClientClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    role<T extends Client$roleArgs<ExtArgs> = {}>(args?: Subset<T, Client$roleArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$RolePayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Client model
   */
  interface ClientFieldRefs {
    readonly id: FieldRef<"Client", 'Int'>
    readonly clientCode: FieldRef<"Client", 'String'>
    readonly clientName: FieldRef<"Client", 'String'>
    readonly status: FieldRef<"Client", 'Int'>
    readonly description: FieldRef<"Client", 'String'>
    readonly isDelete: FieldRef<"Client", 'Boolean'>
    readonly createTime: FieldRef<"Client", 'DateTime'>
    readonly updateTime: FieldRef<"Client", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Client findUnique
   */
  export type ClientFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Client
     */
    select?: ClientSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Client
     */
    omit?: ClientOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ClientInclude<ExtArgs> | null
    /**
     * Filter, which Client to fetch.
     */
    where: ClientWhereUniqueInput
  }

  /**
   * Client findUniqueOrThrow
   */
  export type ClientFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Client
     */
    select?: ClientSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Client
     */
    omit?: ClientOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ClientInclude<ExtArgs> | null
    /**
     * Filter, which Client to fetch.
     */
    where: ClientWhereUniqueInput
  }

  /**
   * Client findFirst
   */
  export type ClientFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Client
     */
    select?: ClientSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Client
     */
    omit?: ClientOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ClientInclude<ExtArgs> | null
    /**
     * Filter, which Client to fetch.
     */
    where?: ClientWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Clients to fetch.
     */
    orderBy?: ClientOrderByWithRelationInput | ClientOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Clients.
     */
    cursor?: ClientWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Clients from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Clients.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Clients.
     */
    distinct?: ClientScalarFieldEnum | ClientScalarFieldEnum[]
  }

  /**
   * Client findFirstOrThrow
   */
  export type ClientFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Client
     */
    select?: ClientSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Client
     */
    omit?: ClientOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ClientInclude<ExtArgs> | null
    /**
     * Filter, which Client to fetch.
     */
    where?: ClientWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Clients to fetch.
     */
    orderBy?: ClientOrderByWithRelationInput | ClientOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Clients.
     */
    cursor?: ClientWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Clients from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Clients.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Clients.
     */
    distinct?: ClientScalarFieldEnum | ClientScalarFieldEnum[]
  }

  /**
   * Client findMany
   */
  export type ClientFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Client
     */
    select?: ClientSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Client
     */
    omit?: ClientOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ClientInclude<ExtArgs> | null
    /**
     * Filter, which Clients to fetch.
     */
    where?: ClientWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Clients to fetch.
     */
    orderBy?: ClientOrderByWithRelationInput | ClientOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Clients.
     */
    cursor?: ClientWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Clients from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Clients.
     */
    skip?: number
    distinct?: ClientScalarFieldEnum | ClientScalarFieldEnum[]
  }

  /**
   * Client create
   */
  export type ClientCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Client
     */
    select?: ClientSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Client
     */
    omit?: ClientOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ClientInclude<ExtArgs> | null
    /**
     * The data needed to create a Client.
     */
    data: XOR<ClientCreateInput, ClientUncheckedCreateInput>
  }

  /**
   * Client createMany
   */
  export type ClientCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Clients.
     */
    data: ClientCreateManyInput | ClientCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Client update
   */
  export type ClientUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Client
     */
    select?: ClientSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Client
     */
    omit?: ClientOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ClientInclude<ExtArgs> | null
    /**
     * The data needed to update a Client.
     */
    data: XOR<ClientUpdateInput, ClientUncheckedUpdateInput>
    /**
     * Choose, which Client to update.
     */
    where: ClientWhereUniqueInput
  }

  /**
   * Client updateMany
   */
  export type ClientUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Clients.
     */
    data: XOR<ClientUpdateManyMutationInput, ClientUncheckedUpdateManyInput>
    /**
     * Filter which Clients to update
     */
    where?: ClientWhereInput
    /**
     * Limit how many Clients to update.
     */
    limit?: number
  }

  /**
   * Client upsert
   */
  export type ClientUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Client
     */
    select?: ClientSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Client
     */
    omit?: ClientOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ClientInclude<ExtArgs> | null
    /**
     * The filter to search for the Client to update in case it exists.
     */
    where: ClientWhereUniqueInput
    /**
     * In case the Client found by the `where` argument doesn't exist, create a new Client with this data.
     */
    create: XOR<ClientCreateInput, ClientUncheckedCreateInput>
    /**
     * In case the Client was found with the provided `where` argument, update it with this data.
     */
    update: XOR<ClientUpdateInput, ClientUncheckedUpdateInput>
  }

  /**
   * Client delete
   */
  export type ClientDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Client
     */
    select?: ClientSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Client
     */
    omit?: ClientOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ClientInclude<ExtArgs> | null
    /**
     * Filter which Client to delete.
     */
    where: ClientWhereUniqueInput
  }

  /**
   * Client deleteMany
   */
  export type ClientDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Clients to delete
     */
    where?: ClientWhereInput
    /**
     * Limit how many Clients to delete.
     */
    limit?: number
  }

  /**
   * Client.role
   */
  export type Client$roleArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Role
     */
    select?: RoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Role
     */
    omit?: RoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RoleInclude<ExtArgs> | null
    where?: RoleWhereInput
    orderBy?: RoleOrderByWithRelationInput | RoleOrderByWithRelationInput[]
    cursor?: RoleWhereUniqueInput
    take?: number
    skip?: number
    distinct?: RoleScalarFieldEnum | RoleScalarFieldEnum[]
  }

  /**
   * Client without action
   */
  export type ClientDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Client
     */
    select?: ClientSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Client
     */
    omit?: ClientOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ClientInclude<ExtArgs> | null
  }


  /**
   * Model Role
   */

  export type AggregateRole = {
    _count: RoleCountAggregateOutputType | null
    _avg: RoleAvgAggregateOutputType | null
    _sum: RoleSumAggregateOutputType | null
    _min: RoleMinAggregateOutputType | null
    _max: RoleMaxAggregateOutputType | null
  }

  export type RoleAvgAggregateOutputType = {
    id: number | null
    clientId: number | null
    status: number | null
  }

  export type RoleSumAggregateOutputType = {
    id: number | null
    clientId: number | null
    status: number | null
  }

  export type RoleMinAggregateOutputType = {
    id: number | null
    roleCode: string | null
    roleName: string | null
    clientId: number | null
    status: number | null
    description: string | null
    isDelete: boolean | null
    createTime: Date | null
    updateTime: Date | null
  }

  export type RoleMaxAggregateOutputType = {
    id: number | null
    roleCode: string | null
    roleName: string | null
    clientId: number | null
    status: number | null
    description: string | null
    isDelete: boolean | null
    createTime: Date | null
    updateTime: Date | null
  }

  export type RoleCountAggregateOutputType = {
    id: number
    roleCode: number
    roleName: number
    clientId: number
    status: number
    description: number
    isDelete: number
    createTime: number
    updateTime: number
    _all: number
  }


  export type RoleAvgAggregateInputType = {
    id?: true
    clientId?: true
    status?: true
  }

  export type RoleSumAggregateInputType = {
    id?: true
    clientId?: true
    status?: true
  }

  export type RoleMinAggregateInputType = {
    id?: true
    roleCode?: true
    roleName?: true
    clientId?: true
    status?: true
    description?: true
    isDelete?: true
    createTime?: true
    updateTime?: true
  }

  export type RoleMaxAggregateInputType = {
    id?: true
    roleCode?: true
    roleName?: true
    clientId?: true
    status?: true
    description?: true
    isDelete?: true
    createTime?: true
    updateTime?: true
  }

  export type RoleCountAggregateInputType = {
    id?: true
    roleCode?: true
    roleName?: true
    clientId?: true
    status?: true
    description?: true
    isDelete?: true
    createTime?: true
    updateTime?: true
    _all?: true
  }

  export type RoleAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Role to aggregate.
     */
    where?: RoleWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Roles to fetch.
     */
    orderBy?: RoleOrderByWithRelationInput | RoleOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: RoleWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Roles from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Roles.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Roles
    **/
    _count?: true | RoleCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: RoleAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: RoleSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: RoleMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: RoleMaxAggregateInputType
  }

  export type GetRoleAggregateType<T extends RoleAggregateArgs> = {
        [P in keyof T & keyof AggregateRole]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateRole[P]>
      : GetScalarType<T[P], AggregateRole[P]>
  }




  export type RoleGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: RoleWhereInput
    orderBy?: RoleOrderByWithAggregationInput | RoleOrderByWithAggregationInput[]
    by: RoleScalarFieldEnum[] | RoleScalarFieldEnum
    having?: RoleScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: RoleCountAggregateInputType | true
    _avg?: RoleAvgAggregateInputType
    _sum?: RoleSumAggregateInputType
    _min?: RoleMinAggregateInputType
    _max?: RoleMaxAggregateInputType
  }

  export type RoleGroupByOutputType = {
    id: number
    roleCode: string
    roleName: string
    clientId: number
    status: number
    description: string | null
    isDelete: boolean
    createTime: Date
    updateTime: Date
    _count: RoleCountAggregateOutputType | null
    _avg: RoleAvgAggregateOutputType | null
    _sum: RoleSumAggregateOutputType | null
    _min: RoleMinAggregateOutputType | null
    _max: RoleMaxAggregateOutputType | null
  }

  type GetRoleGroupByPayload<T extends RoleGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<RoleGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof RoleGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], RoleGroupByOutputType[P]>
            : GetScalarType<T[P], RoleGroupByOutputType[P]>
        }
      >
    >


  export type RoleSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    roleCode?: boolean
    roleName?: boolean
    clientId?: boolean
    status?: boolean
    description?: boolean
    isDelete?: boolean
    createTime?: boolean
    updateTime?: boolean
    client?: boolean | ClientDefaultArgs<ExtArgs>
    positions?: boolean | Role$positionsArgs<ExtArgs>
    organizations?: boolean | Role$organizationsArgs<ExtArgs>
    employments?: boolean | Role$employmentsArgs<ExtArgs>
    privileges?: boolean | Role$privilegesArgs<ExtArgs>
    _count?: boolean | RoleCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["role"]>



  export type RoleSelectScalar = {
    id?: boolean
    roleCode?: boolean
    roleName?: boolean
    clientId?: boolean
    status?: boolean
    description?: boolean
    isDelete?: boolean
    createTime?: boolean
    updateTime?: boolean
  }

  export type RoleOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "roleCode" | "roleName" | "clientId" | "status" | "description" | "isDelete" | "createTime" | "updateTime", ExtArgs["result"]["role"]>
  export type RoleInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    client?: boolean | ClientDefaultArgs<ExtArgs>
    positions?: boolean | Role$positionsArgs<ExtArgs>
    organizations?: boolean | Role$organizationsArgs<ExtArgs>
    employments?: boolean | Role$employmentsArgs<ExtArgs>
    privileges?: boolean | Role$privilegesArgs<ExtArgs>
    _count?: boolean | RoleCountOutputTypeDefaultArgs<ExtArgs>
  }

  export type $RolePayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Role"
    objects: {
      client: Prisma.$ClientPayload<ExtArgs>
      positions: Prisma.$PositionRolePayload<ExtArgs>[]
      organizations: Prisma.$OrganizationRolePayload<ExtArgs>[]
      employments: Prisma.$EmploymentRolePayload<ExtArgs>[]
      privileges: Prisma.$RolePrivilegePayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: number
      roleCode: string
      roleName: string
      clientId: number
      status: number
      description: string | null
      isDelete: boolean
      createTime: Date
      updateTime: Date
    }, ExtArgs["result"]["role"]>
    composites: {}
  }

  type RoleGetPayload<S extends boolean | null | undefined | RoleDefaultArgs> = $Result.GetResult<Prisma.$RolePayload, S>

  type RoleCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<RoleFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: RoleCountAggregateInputType | true
    }

  export interface RoleDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Role'], meta: { name: 'Role' } }
    /**
     * Find zero or one Role that matches the filter.
     * @param {RoleFindUniqueArgs} args - Arguments to find a Role
     * @example
     * // Get one Role
     * const role = await prisma.role.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends RoleFindUniqueArgs>(args: SelectSubset<T, RoleFindUniqueArgs<ExtArgs>>): Prisma__RoleClient<$Result.GetResult<Prisma.$RolePayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Role that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {RoleFindUniqueOrThrowArgs} args - Arguments to find a Role
     * @example
     * // Get one Role
     * const role = await prisma.role.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends RoleFindUniqueOrThrowArgs>(args: SelectSubset<T, RoleFindUniqueOrThrowArgs<ExtArgs>>): Prisma__RoleClient<$Result.GetResult<Prisma.$RolePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Role that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RoleFindFirstArgs} args - Arguments to find a Role
     * @example
     * // Get one Role
     * const role = await prisma.role.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends RoleFindFirstArgs>(args?: SelectSubset<T, RoleFindFirstArgs<ExtArgs>>): Prisma__RoleClient<$Result.GetResult<Prisma.$RolePayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Role that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RoleFindFirstOrThrowArgs} args - Arguments to find a Role
     * @example
     * // Get one Role
     * const role = await prisma.role.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends RoleFindFirstOrThrowArgs>(args?: SelectSubset<T, RoleFindFirstOrThrowArgs<ExtArgs>>): Prisma__RoleClient<$Result.GetResult<Prisma.$RolePayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Roles that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RoleFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Roles
     * const roles = await prisma.role.findMany()
     * 
     * // Get first 10 Roles
     * const roles = await prisma.role.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const roleWithIdOnly = await prisma.role.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends RoleFindManyArgs>(args?: SelectSubset<T, RoleFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$RolePayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Role.
     * @param {RoleCreateArgs} args - Arguments to create a Role.
     * @example
     * // Create one Role
     * const Role = await prisma.role.create({
     *   data: {
     *     // ... data to create a Role
     *   }
     * })
     * 
     */
    create<T extends RoleCreateArgs>(args: SelectSubset<T, RoleCreateArgs<ExtArgs>>): Prisma__RoleClient<$Result.GetResult<Prisma.$RolePayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Roles.
     * @param {RoleCreateManyArgs} args - Arguments to create many Roles.
     * @example
     * // Create many Roles
     * const role = await prisma.role.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends RoleCreateManyArgs>(args?: SelectSubset<T, RoleCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Delete a Role.
     * @param {RoleDeleteArgs} args - Arguments to delete one Role.
     * @example
     * // Delete one Role
     * const Role = await prisma.role.delete({
     *   where: {
     *     // ... filter to delete one Role
     *   }
     * })
     * 
     */
    delete<T extends RoleDeleteArgs>(args: SelectSubset<T, RoleDeleteArgs<ExtArgs>>): Prisma__RoleClient<$Result.GetResult<Prisma.$RolePayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Role.
     * @param {RoleUpdateArgs} args - Arguments to update one Role.
     * @example
     * // Update one Role
     * const role = await prisma.role.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends RoleUpdateArgs>(args: SelectSubset<T, RoleUpdateArgs<ExtArgs>>): Prisma__RoleClient<$Result.GetResult<Prisma.$RolePayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Roles.
     * @param {RoleDeleteManyArgs} args - Arguments to filter Roles to delete.
     * @example
     * // Delete a few Roles
     * const { count } = await prisma.role.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends RoleDeleteManyArgs>(args?: SelectSubset<T, RoleDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Roles.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RoleUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Roles
     * const role = await prisma.role.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends RoleUpdateManyArgs>(args: SelectSubset<T, RoleUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one Role.
     * @param {RoleUpsertArgs} args - Arguments to update or create a Role.
     * @example
     * // Update or create a Role
     * const role = await prisma.role.upsert({
     *   create: {
     *     // ... data to create a Role
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Role we want to update
     *   }
     * })
     */
    upsert<T extends RoleUpsertArgs>(args: SelectSubset<T, RoleUpsertArgs<ExtArgs>>): Prisma__RoleClient<$Result.GetResult<Prisma.$RolePayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Roles.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RoleCountArgs} args - Arguments to filter Roles to count.
     * @example
     * // Count the number of Roles
     * const count = await prisma.role.count({
     *   where: {
     *     // ... the filter for the Roles we want to count
     *   }
     * })
    **/
    count<T extends RoleCountArgs>(
      args?: Subset<T, RoleCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], RoleCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Role.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RoleAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends RoleAggregateArgs>(args: Subset<T, RoleAggregateArgs>): Prisma.PrismaPromise<GetRoleAggregateType<T>>

    /**
     * Group by Role.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RoleGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends RoleGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: RoleGroupByArgs['orderBy'] }
        : { orderBy?: RoleGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, RoleGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetRoleGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Role model
   */
  readonly fields: RoleFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Role.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__RoleClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    client<T extends ClientDefaultArgs<ExtArgs> = {}>(args?: Subset<T, ClientDefaultArgs<ExtArgs>>): Prisma__ClientClient<$Result.GetResult<Prisma.$ClientPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    positions<T extends Role$positionsArgs<ExtArgs> = {}>(args?: Subset<T, Role$positionsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$PositionRolePayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    organizations<T extends Role$organizationsArgs<ExtArgs> = {}>(args?: Subset<T, Role$organizationsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$OrganizationRolePayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    employments<T extends Role$employmentsArgs<ExtArgs> = {}>(args?: Subset<T, Role$employmentsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$EmploymentRolePayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    privileges<T extends Role$privilegesArgs<ExtArgs> = {}>(args?: Subset<T, Role$privilegesArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$RolePrivilegePayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Role model
   */
  interface RoleFieldRefs {
    readonly id: FieldRef<"Role", 'Int'>
    readonly roleCode: FieldRef<"Role", 'String'>
    readonly roleName: FieldRef<"Role", 'String'>
    readonly clientId: FieldRef<"Role", 'Int'>
    readonly status: FieldRef<"Role", 'Int'>
    readonly description: FieldRef<"Role", 'String'>
    readonly isDelete: FieldRef<"Role", 'Boolean'>
    readonly createTime: FieldRef<"Role", 'DateTime'>
    readonly updateTime: FieldRef<"Role", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Role findUnique
   */
  export type RoleFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Role
     */
    select?: RoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Role
     */
    omit?: RoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RoleInclude<ExtArgs> | null
    /**
     * Filter, which Role to fetch.
     */
    where: RoleWhereUniqueInput
  }

  /**
   * Role findUniqueOrThrow
   */
  export type RoleFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Role
     */
    select?: RoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Role
     */
    omit?: RoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RoleInclude<ExtArgs> | null
    /**
     * Filter, which Role to fetch.
     */
    where: RoleWhereUniqueInput
  }

  /**
   * Role findFirst
   */
  export type RoleFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Role
     */
    select?: RoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Role
     */
    omit?: RoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RoleInclude<ExtArgs> | null
    /**
     * Filter, which Role to fetch.
     */
    where?: RoleWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Roles to fetch.
     */
    orderBy?: RoleOrderByWithRelationInput | RoleOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Roles.
     */
    cursor?: RoleWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Roles from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Roles.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Roles.
     */
    distinct?: RoleScalarFieldEnum | RoleScalarFieldEnum[]
  }

  /**
   * Role findFirstOrThrow
   */
  export type RoleFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Role
     */
    select?: RoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Role
     */
    omit?: RoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RoleInclude<ExtArgs> | null
    /**
     * Filter, which Role to fetch.
     */
    where?: RoleWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Roles to fetch.
     */
    orderBy?: RoleOrderByWithRelationInput | RoleOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Roles.
     */
    cursor?: RoleWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Roles from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Roles.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Roles.
     */
    distinct?: RoleScalarFieldEnum | RoleScalarFieldEnum[]
  }

  /**
   * Role findMany
   */
  export type RoleFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Role
     */
    select?: RoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Role
     */
    omit?: RoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RoleInclude<ExtArgs> | null
    /**
     * Filter, which Roles to fetch.
     */
    where?: RoleWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Roles to fetch.
     */
    orderBy?: RoleOrderByWithRelationInput | RoleOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Roles.
     */
    cursor?: RoleWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Roles from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Roles.
     */
    skip?: number
    distinct?: RoleScalarFieldEnum | RoleScalarFieldEnum[]
  }

  /**
   * Role create
   */
  export type RoleCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Role
     */
    select?: RoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Role
     */
    omit?: RoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RoleInclude<ExtArgs> | null
    /**
     * The data needed to create a Role.
     */
    data: XOR<RoleCreateInput, RoleUncheckedCreateInput>
  }

  /**
   * Role createMany
   */
  export type RoleCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Roles.
     */
    data: RoleCreateManyInput | RoleCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Role update
   */
  export type RoleUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Role
     */
    select?: RoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Role
     */
    omit?: RoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RoleInclude<ExtArgs> | null
    /**
     * The data needed to update a Role.
     */
    data: XOR<RoleUpdateInput, RoleUncheckedUpdateInput>
    /**
     * Choose, which Role to update.
     */
    where: RoleWhereUniqueInput
  }

  /**
   * Role updateMany
   */
  export type RoleUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Roles.
     */
    data: XOR<RoleUpdateManyMutationInput, RoleUncheckedUpdateManyInput>
    /**
     * Filter which Roles to update
     */
    where?: RoleWhereInput
    /**
     * Limit how many Roles to update.
     */
    limit?: number
  }

  /**
   * Role upsert
   */
  export type RoleUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Role
     */
    select?: RoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Role
     */
    omit?: RoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RoleInclude<ExtArgs> | null
    /**
     * The filter to search for the Role to update in case it exists.
     */
    where: RoleWhereUniqueInput
    /**
     * In case the Role found by the `where` argument doesn't exist, create a new Role with this data.
     */
    create: XOR<RoleCreateInput, RoleUncheckedCreateInput>
    /**
     * In case the Role was found with the provided `where` argument, update it with this data.
     */
    update: XOR<RoleUpdateInput, RoleUncheckedUpdateInput>
  }

  /**
   * Role delete
   */
  export type RoleDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Role
     */
    select?: RoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Role
     */
    omit?: RoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RoleInclude<ExtArgs> | null
    /**
     * Filter which Role to delete.
     */
    where: RoleWhereUniqueInput
  }

  /**
   * Role deleteMany
   */
  export type RoleDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Roles to delete
     */
    where?: RoleWhereInput
    /**
     * Limit how many Roles to delete.
     */
    limit?: number
  }

  /**
   * Role.positions
   */
  export type Role$positionsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PositionRole
     */
    select?: PositionRoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the PositionRole
     */
    omit?: PositionRoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PositionRoleInclude<ExtArgs> | null
    where?: PositionRoleWhereInput
    orderBy?: PositionRoleOrderByWithRelationInput | PositionRoleOrderByWithRelationInput[]
    cursor?: PositionRoleWhereUniqueInput
    take?: number
    skip?: number
    distinct?: PositionRoleScalarFieldEnum | PositionRoleScalarFieldEnum[]
  }

  /**
   * Role.organizations
   */
  export type Role$organizationsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OrganizationRole
     */
    select?: OrganizationRoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the OrganizationRole
     */
    omit?: OrganizationRoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OrganizationRoleInclude<ExtArgs> | null
    where?: OrganizationRoleWhereInput
    orderBy?: OrganizationRoleOrderByWithRelationInput | OrganizationRoleOrderByWithRelationInput[]
    cursor?: OrganizationRoleWhereUniqueInput
    take?: number
    skip?: number
    distinct?: OrganizationRoleScalarFieldEnum | OrganizationRoleScalarFieldEnum[]
  }

  /**
   * Role.employments
   */
  export type Role$employmentsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EmploymentRole
     */
    select?: EmploymentRoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the EmploymentRole
     */
    omit?: EmploymentRoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EmploymentRoleInclude<ExtArgs> | null
    where?: EmploymentRoleWhereInput
    orderBy?: EmploymentRoleOrderByWithRelationInput | EmploymentRoleOrderByWithRelationInput[]
    cursor?: EmploymentRoleWhereUniqueInput
    take?: number
    skip?: number
    distinct?: EmploymentRoleScalarFieldEnum | EmploymentRoleScalarFieldEnum[]
  }

  /**
   * Role.privileges
   */
  export type Role$privilegesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RolePrivilege
     */
    select?: RolePrivilegeSelect<ExtArgs> | null
    /**
     * Omit specific fields from the RolePrivilege
     */
    omit?: RolePrivilegeOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RolePrivilegeInclude<ExtArgs> | null
    where?: RolePrivilegeWhereInput
    orderBy?: RolePrivilegeOrderByWithRelationInput | RolePrivilegeOrderByWithRelationInput[]
    cursor?: RolePrivilegeWhereUniqueInput
    take?: number
    skip?: number
    distinct?: RolePrivilegeScalarFieldEnum | RolePrivilegeScalarFieldEnum[]
  }

  /**
   * Role without action
   */
  export type RoleDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Role
     */
    select?: RoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Role
     */
    omit?: RoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RoleInclude<ExtArgs> | null
  }


  /**
   * Model PositionRole
   */

  export type AggregatePositionRole = {
    _count: PositionRoleCountAggregateOutputType | null
    _avg: PositionRoleAvgAggregateOutputType | null
    _sum: PositionRoleSumAggregateOutputType | null
    _min: PositionRoleMinAggregateOutputType | null
    _max: PositionRoleMaxAggregateOutputType | null
  }

  export type PositionRoleAvgAggregateOutputType = {
    positionId: number | null
    roleId: number | null
  }

  export type PositionRoleSumAggregateOutputType = {
    positionId: number | null
    roleId: number | null
  }

  export type PositionRoleMinAggregateOutputType = {
    positionId: number | null
    roleId: number | null
  }

  export type PositionRoleMaxAggregateOutputType = {
    positionId: number | null
    roleId: number | null
  }

  export type PositionRoleCountAggregateOutputType = {
    positionId: number
    roleId: number
    _all: number
  }


  export type PositionRoleAvgAggregateInputType = {
    positionId?: true
    roleId?: true
  }

  export type PositionRoleSumAggregateInputType = {
    positionId?: true
    roleId?: true
  }

  export type PositionRoleMinAggregateInputType = {
    positionId?: true
    roleId?: true
  }

  export type PositionRoleMaxAggregateInputType = {
    positionId?: true
    roleId?: true
  }

  export type PositionRoleCountAggregateInputType = {
    positionId?: true
    roleId?: true
    _all?: true
  }

  export type PositionRoleAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which PositionRole to aggregate.
     */
    where?: PositionRoleWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of PositionRoles to fetch.
     */
    orderBy?: PositionRoleOrderByWithRelationInput | PositionRoleOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: PositionRoleWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` PositionRoles from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` PositionRoles.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned PositionRoles
    **/
    _count?: true | PositionRoleCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: PositionRoleAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: PositionRoleSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: PositionRoleMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: PositionRoleMaxAggregateInputType
  }

  export type GetPositionRoleAggregateType<T extends PositionRoleAggregateArgs> = {
        [P in keyof T & keyof AggregatePositionRole]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregatePositionRole[P]>
      : GetScalarType<T[P], AggregatePositionRole[P]>
  }




  export type PositionRoleGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: PositionRoleWhereInput
    orderBy?: PositionRoleOrderByWithAggregationInput | PositionRoleOrderByWithAggregationInput[]
    by: PositionRoleScalarFieldEnum[] | PositionRoleScalarFieldEnum
    having?: PositionRoleScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: PositionRoleCountAggregateInputType | true
    _avg?: PositionRoleAvgAggregateInputType
    _sum?: PositionRoleSumAggregateInputType
    _min?: PositionRoleMinAggregateInputType
    _max?: PositionRoleMaxAggregateInputType
  }

  export type PositionRoleGroupByOutputType = {
    positionId: number
    roleId: number
    _count: PositionRoleCountAggregateOutputType | null
    _avg: PositionRoleAvgAggregateOutputType | null
    _sum: PositionRoleSumAggregateOutputType | null
    _min: PositionRoleMinAggregateOutputType | null
    _max: PositionRoleMaxAggregateOutputType | null
  }

  type GetPositionRoleGroupByPayload<T extends PositionRoleGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<PositionRoleGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof PositionRoleGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], PositionRoleGroupByOutputType[P]>
            : GetScalarType<T[P], PositionRoleGroupByOutputType[P]>
        }
      >
    >


  export type PositionRoleSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    positionId?: boolean
    roleId?: boolean
    position?: boolean | PositionDefaultArgs<ExtArgs>
    role?: boolean | RoleDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["positionRole"]>



  export type PositionRoleSelectScalar = {
    positionId?: boolean
    roleId?: boolean
  }

  export type PositionRoleOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"positionId" | "roleId", ExtArgs["result"]["positionRole"]>
  export type PositionRoleInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    position?: boolean | PositionDefaultArgs<ExtArgs>
    role?: boolean | RoleDefaultArgs<ExtArgs>
  }

  export type $PositionRolePayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "PositionRole"
    objects: {
      position: Prisma.$PositionPayload<ExtArgs>
      role: Prisma.$RolePayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      positionId: number
      roleId: number
    }, ExtArgs["result"]["positionRole"]>
    composites: {}
  }

  type PositionRoleGetPayload<S extends boolean | null | undefined | PositionRoleDefaultArgs> = $Result.GetResult<Prisma.$PositionRolePayload, S>

  type PositionRoleCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<PositionRoleFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: PositionRoleCountAggregateInputType | true
    }

  export interface PositionRoleDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['PositionRole'], meta: { name: 'PositionRole' } }
    /**
     * Find zero or one PositionRole that matches the filter.
     * @param {PositionRoleFindUniqueArgs} args - Arguments to find a PositionRole
     * @example
     * // Get one PositionRole
     * const positionRole = await prisma.positionRole.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends PositionRoleFindUniqueArgs>(args: SelectSubset<T, PositionRoleFindUniqueArgs<ExtArgs>>): Prisma__PositionRoleClient<$Result.GetResult<Prisma.$PositionRolePayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one PositionRole that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {PositionRoleFindUniqueOrThrowArgs} args - Arguments to find a PositionRole
     * @example
     * // Get one PositionRole
     * const positionRole = await prisma.positionRole.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends PositionRoleFindUniqueOrThrowArgs>(args: SelectSubset<T, PositionRoleFindUniqueOrThrowArgs<ExtArgs>>): Prisma__PositionRoleClient<$Result.GetResult<Prisma.$PositionRolePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first PositionRole that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PositionRoleFindFirstArgs} args - Arguments to find a PositionRole
     * @example
     * // Get one PositionRole
     * const positionRole = await prisma.positionRole.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends PositionRoleFindFirstArgs>(args?: SelectSubset<T, PositionRoleFindFirstArgs<ExtArgs>>): Prisma__PositionRoleClient<$Result.GetResult<Prisma.$PositionRolePayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first PositionRole that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PositionRoleFindFirstOrThrowArgs} args - Arguments to find a PositionRole
     * @example
     * // Get one PositionRole
     * const positionRole = await prisma.positionRole.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends PositionRoleFindFirstOrThrowArgs>(args?: SelectSubset<T, PositionRoleFindFirstOrThrowArgs<ExtArgs>>): Prisma__PositionRoleClient<$Result.GetResult<Prisma.$PositionRolePayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more PositionRoles that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PositionRoleFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all PositionRoles
     * const positionRoles = await prisma.positionRole.findMany()
     * 
     * // Get first 10 PositionRoles
     * const positionRoles = await prisma.positionRole.findMany({ take: 10 })
     * 
     * // Only select the `positionId`
     * const positionRoleWithPositionIdOnly = await prisma.positionRole.findMany({ select: { positionId: true } })
     * 
     */
    findMany<T extends PositionRoleFindManyArgs>(args?: SelectSubset<T, PositionRoleFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$PositionRolePayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a PositionRole.
     * @param {PositionRoleCreateArgs} args - Arguments to create a PositionRole.
     * @example
     * // Create one PositionRole
     * const PositionRole = await prisma.positionRole.create({
     *   data: {
     *     // ... data to create a PositionRole
     *   }
     * })
     * 
     */
    create<T extends PositionRoleCreateArgs>(args: SelectSubset<T, PositionRoleCreateArgs<ExtArgs>>): Prisma__PositionRoleClient<$Result.GetResult<Prisma.$PositionRolePayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many PositionRoles.
     * @param {PositionRoleCreateManyArgs} args - Arguments to create many PositionRoles.
     * @example
     * // Create many PositionRoles
     * const positionRole = await prisma.positionRole.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends PositionRoleCreateManyArgs>(args?: SelectSubset<T, PositionRoleCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Delete a PositionRole.
     * @param {PositionRoleDeleteArgs} args - Arguments to delete one PositionRole.
     * @example
     * // Delete one PositionRole
     * const PositionRole = await prisma.positionRole.delete({
     *   where: {
     *     // ... filter to delete one PositionRole
     *   }
     * })
     * 
     */
    delete<T extends PositionRoleDeleteArgs>(args: SelectSubset<T, PositionRoleDeleteArgs<ExtArgs>>): Prisma__PositionRoleClient<$Result.GetResult<Prisma.$PositionRolePayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one PositionRole.
     * @param {PositionRoleUpdateArgs} args - Arguments to update one PositionRole.
     * @example
     * // Update one PositionRole
     * const positionRole = await prisma.positionRole.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends PositionRoleUpdateArgs>(args: SelectSubset<T, PositionRoleUpdateArgs<ExtArgs>>): Prisma__PositionRoleClient<$Result.GetResult<Prisma.$PositionRolePayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more PositionRoles.
     * @param {PositionRoleDeleteManyArgs} args - Arguments to filter PositionRoles to delete.
     * @example
     * // Delete a few PositionRoles
     * const { count } = await prisma.positionRole.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends PositionRoleDeleteManyArgs>(args?: SelectSubset<T, PositionRoleDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more PositionRoles.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PositionRoleUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many PositionRoles
     * const positionRole = await prisma.positionRole.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends PositionRoleUpdateManyArgs>(args: SelectSubset<T, PositionRoleUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one PositionRole.
     * @param {PositionRoleUpsertArgs} args - Arguments to update or create a PositionRole.
     * @example
     * // Update or create a PositionRole
     * const positionRole = await prisma.positionRole.upsert({
     *   create: {
     *     // ... data to create a PositionRole
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the PositionRole we want to update
     *   }
     * })
     */
    upsert<T extends PositionRoleUpsertArgs>(args: SelectSubset<T, PositionRoleUpsertArgs<ExtArgs>>): Prisma__PositionRoleClient<$Result.GetResult<Prisma.$PositionRolePayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of PositionRoles.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PositionRoleCountArgs} args - Arguments to filter PositionRoles to count.
     * @example
     * // Count the number of PositionRoles
     * const count = await prisma.positionRole.count({
     *   where: {
     *     // ... the filter for the PositionRoles we want to count
     *   }
     * })
    **/
    count<T extends PositionRoleCountArgs>(
      args?: Subset<T, PositionRoleCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], PositionRoleCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a PositionRole.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PositionRoleAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends PositionRoleAggregateArgs>(args: Subset<T, PositionRoleAggregateArgs>): Prisma.PrismaPromise<GetPositionRoleAggregateType<T>>

    /**
     * Group by PositionRole.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PositionRoleGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends PositionRoleGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: PositionRoleGroupByArgs['orderBy'] }
        : { orderBy?: PositionRoleGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, PositionRoleGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetPositionRoleGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the PositionRole model
   */
  readonly fields: PositionRoleFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for PositionRole.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__PositionRoleClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    position<T extends PositionDefaultArgs<ExtArgs> = {}>(args?: Subset<T, PositionDefaultArgs<ExtArgs>>): Prisma__PositionClient<$Result.GetResult<Prisma.$PositionPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    role<T extends RoleDefaultArgs<ExtArgs> = {}>(args?: Subset<T, RoleDefaultArgs<ExtArgs>>): Prisma__RoleClient<$Result.GetResult<Prisma.$RolePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the PositionRole model
   */
  interface PositionRoleFieldRefs {
    readonly positionId: FieldRef<"PositionRole", 'Int'>
    readonly roleId: FieldRef<"PositionRole", 'Int'>
  }
    

  // Custom InputTypes
  /**
   * PositionRole findUnique
   */
  export type PositionRoleFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PositionRole
     */
    select?: PositionRoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the PositionRole
     */
    omit?: PositionRoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PositionRoleInclude<ExtArgs> | null
    /**
     * Filter, which PositionRole to fetch.
     */
    where: PositionRoleWhereUniqueInput
  }

  /**
   * PositionRole findUniqueOrThrow
   */
  export type PositionRoleFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PositionRole
     */
    select?: PositionRoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the PositionRole
     */
    omit?: PositionRoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PositionRoleInclude<ExtArgs> | null
    /**
     * Filter, which PositionRole to fetch.
     */
    where: PositionRoleWhereUniqueInput
  }

  /**
   * PositionRole findFirst
   */
  export type PositionRoleFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PositionRole
     */
    select?: PositionRoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the PositionRole
     */
    omit?: PositionRoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PositionRoleInclude<ExtArgs> | null
    /**
     * Filter, which PositionRole to fetch.
     */
    where?: PositionRoleWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of PositionRoles to fetch.
     */
    orderBy?: PositionRoleOrderByWithRelationInput | PositionRoleOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for PositionRoles.
     */
    cursor?: PositionRoleWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` PositionRoles from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` PositionRoles.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of PositionRoles.
     */
    distinct?: PositionRoleScalarFieldEnum | PositionRoleScalarFieldEnum[]
  }

  /**
   * PositionRole findFirstOrThrow
   */
  export type PositionRoleFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PositionRole
     */
    select?: PositionRoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the PositionRole
     */
    omit?: PositionRoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PositionRoleInclude<ExtArgs> | null
    /**
     * Filter, which PositionRole to fetch.
     */
    where?: PositionRoleWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of PositionRoles to fetch.
     */
    orderBy?: PositionRoleOrderByWithRelationInput | PositionRoleOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for PositionRoles.
     */
    cursor?: PositionRoleWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` PositionRoles from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` PositionRoles.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of PositionRoles.
     */
    distinct?: PositionRoleScalarFieldEnum | PositionRoleScalarFieldEnum[]
  }

  /**
   * PositionRole findMany
   */
  export type PositionRoleFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PositionRole
     */
    select?: PositionRoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the PositionRole
     */
    omit?: PositionRoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PositionRoleInclude<ExtArgs> | null
    /**
     * Filter, which PositionRoles to fetch.
     */
    where?: PositionRoleWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of PositionRoles to fetch.
     */
    orderBy?: PositionRoleOrderByWithRelationInput | PositionRoleOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing PositionRoles.
     */
    cursor?: PositionRoleWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` PositionRoles from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` PositionRoles.
     */
    skip?: number
    distinct?: PositionRoleScalarFieldEnum | PositionRoleScalarFieldEnum[]
  }

  /**
   * PositionRole create
   */
  export type PositionRoleCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PositionRole
     */
    select?: PositionRoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the PositionRole
     */
    omit?: PositionRoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PositionRoleInclude<ExtArgs> | null
    /**
     * The data needed to create a PositionRole.
     */
    data: XOR<PositionRoleCreateInput, PositionRoleUncheckedCreateInput>
  }

  /**
   * PositionRole createMany
   */
  export type PositionRoleCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many PositionRoles.
     */
    data: PositionRoleCreateManyInput | PositionRoleCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * PositionRole update
   */
  export type PositionRoleUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PositionRole
     */
    select?: PositionRoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the PositionRole
     */
    omit?: PositionRoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PositionRoleInclude<ExtArgs> | null
    /**
     * The data needed to update a PositionRole.
     */
    data: XOR<PositionRoleUpdateInput, PositionRoleUncheckedUpdateInput>
    /**
     * Choose, which PositionRole to update.
     */
    where: PositionRoleWhereUniqueInput
  }

  /**
   * PositionRole updateMany
   */
  export type PositionRoleUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update PositionRoles.
     */
    data: XOR<PositionRoleUpdateManyMutationInput, PositionRoleUncheckedUpdateManyInput>
    /**
     * Filter which PositionRoles to update
     */
    where?: PositionRoleWhereInput
    /**
     * Limit how many PositionRoles to update.
     */
    limit?: number
  }

  /**
   * PositionRole upsert
   */
  export type PositionRoleUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PositionRole
     */
    select?: PositionRoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the PositionRole
     */
    omit?: PositionRoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PositionRoleInclude<ExtArgs> | null
    /**
     * The filter to search for the PositionRole to update in case it exists.
     */
    where: PositionRoleWhereUniqueInput
    /**
     * In case the PositionRole found by the `where` argument doesn't exist, create a new PositionRole with this data.
     */
    create: XOR<PositionRoleCreateInput, PositionRoleUncheckedCreateInput>
    /**
     * In case the PositionRole was found with the provided `where` argument, update it with this data.
     */
    update: XOR<PositionRoleUpdateInput, PositionRoleUncheckedUpdateInput>
  }

  /**
   * PositionRole delete
   */
  export type PositionRoleDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PositionRole
     */
    select?: PositionRoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the PositionRole
     */
    omit?: PositionRoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PositionRoleInclude<ExtArgs> | null
    /**
     * Filter which PositionRole to delete.
     */
    where: PositionRoleWhereUniqueInput
  }

  /**
   * PositionRole deleteMany
   */
  export type PositionRoleDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which PositionRoles to delete
     */
    where?: PositionRoleWhereInput
    /**
     * Limit how many PositionRoles to delete.
     */
    limit?: number
  }

  /**
   * PositionRole without action
   */
  export type PositionRoleDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PositionRole
     */
    select?: PositionRoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the PositionRole
     */
    omit?: PositionRoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PositionRoleInclude<ExtArgs> | null
  }


  /**
   * Model EmploymentRole
   */

  export type AggregateEmploymentRole = {
    _count: EmploymentRoleCountAggregateOutputType | null
    _avg: EmploymentRoleAvgAggregateOutputType | null
    _sum: EmploymentRoleSumAggregateOutputType | null
    _min: EmploymentRoleMinAggregateOutputType | null
    _max: EmploymentRoleMaxAggregateOutputType | null
  }

  export type EmploymentRoleAvgAggregateOutputType = {
    employmentId: number | null
    roleId: number | null
  }

  export type EmploymentRoleSumAggregateOutputType = {
    employmentId: number | null
    roleId: number | null
  }

  export type EmploymentRoleMinAggregateOutputType = {
    employmentId: number | null
    roleId: number | null
  }

  export type EmploymentRoleMaxAggregateOutputType = {
    employmentId: number | null
    roleId: number | null
  }

  export type EmploymentRoleCountAggregateOutputType = {
    employmentId: number
    roleId: number
    _all: number
  }


  export type EmploymentRoleAvgAggregateInputType = {
    employmentId?: true
    roleId?: true
  }

  export type EmploymentRoleSumAggregateInputType = {
    employmentId?: true
    roleId?: true
  }

  export type EmploymentRoleMinAggregateInputType = {
    employmentId?: true
    roleId?: true
  }

  export type EmploymentRoleMaxAggregateInputType = {
    employmentId?: true
    roleId?: true
  }

  export type EmploymentRoleCountAggregateInputType = {
    employmentId?: true
    roleId?: true
    _all?: true
  }

  export type EmploymentRoleAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which EmploymentRole to aggregate.
     */
    where?: EmploymentRoleWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of EmploymentRoles to fetch.
     */
    orderBy?: EmploymentRoleOrderByWithRelationInput | EmploymentRoleOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: EmploymentRoleWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` EmploymentRoles from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` EmploymentRoles.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned EmploymentRoles
    **/
    _count?: true | EmploymentRoleCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: EmploymentRoleAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: EmploymentRoleSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: EmploymentRoleMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: EmploymentRoleMaxAggregateInputType
  }

  export type GetEmploymentRoleAggregateType<T extends EmploymentRoleAggregateArgs> = {
        [P in keyof T & keyof AggregateEmploymentRole]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateEmploymentRole[P]>
      : GetScalarType<T[P], AggregateEmploymentRole[P]>
  }




  export type EmploymentRoleGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: EmploymentRoleWhereInput
    orderBy?: EmploymentRoleOrderByWithAggregationInput | EmploymentRoleOrderByWithAggregationInput[]
    by: EmploymentRoleScalarFieldEnum[] | EmploymentRoleScalarFieldEnum
    having?: EmploymentRoleScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: EmploymentRoleCountAggregateInputType | true
    _avg?: EmploymentRoleAvgAggregateInputType
    _sum?: EmploymentRoleSumAggregateInputType
    _min?: EmploymentRoleMinAggregateInputType
    _max?: EmploymentRoleMaxAggregateInputType
  }

  export type EmploymentRoleGroupByOutputType = {
    employmentId: number
    roleId: number
    _count: EmploymentRoleCountAggregateOutputType | null
    _avg: EmploymentRoleAvgAggregateOutputType | null
    _sum: EmploymentRoleSumAggregateOutputType | null
    _min: EmploymentRoleMinAggregateOutputType | null
    _max: EmploymentRoleMaxAggregateOutputType | null
  }

  type GetEmploymentRoleGroupByPayload<T extends EmploymentRoleGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<EmploymentRoleGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof EmploymentRoleGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], EmploymentRoleGroupByOutputType[P]>
            : GetScalarType<T[P], EmploymentRoleGroupByOutputType[P]>
        }
      >
    >


  export type EmploymentRoleSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    employmentId?: boolean
    roleId?: boolean
    employment?: boolean | EmploymentDefaultArgs<ExtArgs>
    role?: boolean | RoleDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["employmentRole"]>



  export type EmploymentRoleSelectScalar = {
    employmentId?: boolean
    roleId?: boolean
  }

  export type EmploymentRoleOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"employmentId" | "roleId", ExtArgs["result"]["employmentRole"]>
  export type EmploymentRoleInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    employment?: boolean | EmploymentDefaultArgs<ExtArgs>
    role?: boolean | RoleDefaultArgs<ExtArgs>
  }

  export type $EmploymentRolePayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "EmploymentRole"
    objects: {
      employment: Prisma.$EmploymentPayload<ExtArgs>
      role: Prisma.$RolePayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      employmentId: number
      roleId: number
    }, ExtArgs["result"]["employmentRole"]>
    composites: {}
  }

  type EmploymentRoleGetPayload<S extends boolean | null | undefined | EmploymentRoleDefaultArgs> = $Result.GetResult<Prisma.$EmploymentRolePayload, S>

  type EmploymentRoleCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<EmploymentRoleFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: EmploymentRoleCountAggregateInputType | true
    }

  export interface EmploymentRoleDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['EmploymentRole'], meta: { name: 'EmploymentRole' } }
    /**
     * Find zero or one EmploymentRole that matches the filter.
     * @param {EmploymentRoleFindUniqueArgs} args - Arguments to find a EmploymentRole
     * @example
     * // Get one EmploymentRole
     * const employmentRole = await prisma.employmentRole.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends EmploymentRoleFindUniqueArgs>(args: SelectSubset<T, EmploymentRoleFindUniqueArgs<ExtArgs>>): Prisma__EmploymentRoleClient<$Result.GetResult<Prisma.$EmploymentRolePayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one EmploymentRole that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {EmploymentRoleFindUniqueOrThrowArgs} args - Arguments to find a EmploymentRole
     * @example
     * // Get one EmploymentRole
     * const employmentRole = await prisma.employmentRole.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends EmploymentRoleFindUniqueOrThrowArgs>(args: SelectSubset<T, EmploymentRoleFindUniqueOrThrowArgs<ExtArgs>>): Prisma__EmploymentRoleClient<$Result.GetResult<Prisma.$EmploymentRolePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first EmploymentRole that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EmploymentRoleFindFirstArgs} args - Arguments to find a EmploymentRole
     * @example
     * // Get one EmploymentRole
     * const employmentRole = await prisma.employmentRole.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends EmploymentRoleFindFirstArgs>(args?: SelectSubset<T, EmploymentRoleFindFirstArgs<ExtArgs>>): Prisma__EmploymentRoleClient<$Result.GetResult<Prisma.$EmploymentRolePayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first EmploymentRole that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EmploymentRoleFindFirstOrThrowArgs} args - Arguments to find a EmploymentRole
     * @example
     * // Get one EmploymentRole
     * const employmentRole = await prisma.employmentRole.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends EmploymentRoleFindFirstOrThrowArgs>(args?: SelectSubset<T, EmploymentRoleFindFirstOrThrowArgs<ExtArgs>>): Prisma__EmploymentRoleClient<$Result.GetResult<Prisma.$EmploymentRolePayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more EmploymentRoles that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EmploymentRoleFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all EmploymentRoles
     * const employmentRoles = await prisma.employmentRole.findMany()
     * 
     * // Get first 10 EmploymentRoles
     * const employmentRoles = await prisma.employmentRole.findMany({ take: 10 })
     * 
     * // Only select the `employmentId`
     * const employmentRoleWithEmploymentIdOnly = await prisma.employmentRole.findMany({ select: { employmentId: true } })
     * 
     */
    findMany<T extends EmploymentRoleFindManyArgs>(args?: SelectSubset<T, EmploymentRoleFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$EmploymentRolePayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a EmploymentRole.
     * @param {EmploymentRoleCreateArgs} args - Arguments to create a EmploymentRole.
     * @example
     * // Create one EmploymentRole
     * const EmploymentRole = await prisma.employmentRole.create({
     *   data: {
     *     // ... data to create a EmploymentRole
     *   }
     * })
     * 
     */
    create<T extends EmploymentRoleCreateArgs>(args: SelectSubset<T, EmploymentRoleCreateArgs<ExtArgs>>): Prisma__EmploymentRoleClient<$Result.GetResult<Prisma.$EmploymentRolePayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many EmploymentRoles.
     * @param {EmploymentRoleCreateManyArgs} args - Arguments to create many EmploymentRoles.
     * @example
     * // Create many EmploymentRoles
     * const employmentRole = await prisma.employmentRole.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends EmploymentRoleCreateManyArgs>(args?: SelectSubset<T, EmploymentRoleCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Delete a EmploymentRole.
     * @param {EmploymentRoleDeleteArgs} args - Arguments to delete one EmploymentRole.
     * @example
     * // Delete one EmploymentRole
     * const EmploymentRole = await prisma.employmentRole.delete({
     *   where: {
     *     // ... filter to delete one EmploymentRole
     *   }
     * })
     * 
     */
    delete<T extends EmploymentRoleDeleteArgs>(args: SelectSubset<T, EmploymentRoleDeleteArgs<ExtArgs>>): Prisma__EmploymentRoleClient<$Result.GetResult<Prisma.$EmploymentRolePayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one EmploymentRole.
     * @param {EmploymentRoleUpdateArgs} args - Arguments to update one EmploymentRole.
     * @example
     * // Update one EmploymentRole
     * const employmentRole = await prisma.employmentRole.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends EmploymentRoleUpdateArgs>(args: SelectSubset<T, EmploymentRoleUpdateArgs<ExtArgs>>): Prisma__EmploymentRoleClient<$Result.GetResult<Prisma.$EmploymentRolePayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more EmploymentRoles.
     * @param {EmploymentRoleDeleteManyArgs} args - Arguments to filter EmploymentRoles to delete.
     * @example
     * // Delete a few EmploymentRoles
     * const { count } = await prisma.employmentRole.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends EmploymentRoleDeleteManyArgs>(args?: SelectSubset<T, EmploymentRoleDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more EmploymentRoles.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EmploymentRoleUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many EmploymentRoles
     * const employmentRole = await prisma.employmentRole.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends EmploymentRoleUpdateManyArgs>(args: SelectSubset<T, EmploymentRoleUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one EmploymentRole.
     * @param {EmploymentRoleUpsertArgs} args - Arguments to update or create a EmploymentRole.
     * @example
     * // Update or create a EmploymentRole
     * const employmentRole = await prisma.employmentRole.upsert({
     *   create: {
     *     // ... data to create a EmploymentRole
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the EmploymentRole we want to update
     *   }
     * })
     */
    upsert<T extends EmploymentRoleUpsertArgs>(args: SelectSubset<T, EmploymentRoleUpsertArgs<ExtArgs>>): Prisma__EmploymentRoleClient<$Result.GetResult<Prisma.$EmploymentRolePayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of EmploymentRoles.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EmploymentRoleCountArgs} args - Arguments to filter EmploymentRoles to count.
     * @example
     * // Count the number of EmploymentRoles
     * const count = await prisma.employmentRole.count({
     *   where: {
     *     // ... the filter for the EmploymentRoles we want to count
     *   }
     * })
    **/
    count<T extends EmploymentRoleCountArgs>(
      args?: Subset<T, EmploymentRoleCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], EmploymentRoleCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a EmploymentRole.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EmploymentRoleAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends EmploymentRoleAggregateArgs>(args: Subset<T, EmploymentRoleAggregateArgs>): Prisma.PrismaPromise<GetEmploymentRoleAggregateType<T>>

    /**
     * Group by EmploymentRole.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {EmploymentRoleGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends EmploymentRoleGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: EmploymentRoleGroupByArgs['orderBy'] }
        : { orderBy?: EmploymentRoleGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, EmploymentRoleGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetEmploymentRoleGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the EmploymentRole model
   */
  readonly fields: EmploymentRoleFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for EmploymentRole.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__EmploymentRoleClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    employment<T extends EmploymentDefaultArgs<ExtArgs> = {}>(args?: Subset<T, EmploymentDefaultArgs<ExtArgs>>): Prisma__EmploymentClient<$Result.GetResult<Prisma.$EmploymentPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    role<T extends RoleDefaultArgs<ExtArgs> = {}>(args?: Subset<T, RoleDefaultArgs<ExtArgs>>): Prisma__RoleClient<$Result.GetResult<Prisma.$RolePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the EmploymentRole model
   */
  interface EmploymentRoleFieldRefs {
    readonly employmentId: FieldRef<"EmploymentRole", 'Int'>
    readonly roleId: FieldRef<"EmploymentRole", 'Int'>
  }
    

  // Custom InputTypes
  /**
   * EmploymentRole findUnique
   */
  export type EmploymentRoleFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EmploymentRole
     */
    select?: EmploymentRoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the EmploymentRole
     */
    omit?: EmploymentRoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EmploymentRoleInclude<ExtArgs> | null
    /**
     * Filter, which EmploymentRole to fetch.
     */
    where: EmploymentRoleWhereUniqueInput
  }

  /**
   * EmploymentRole findUniqueOrThrow
   */
  export type EmploymentRoleFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EmploymentRole
     */
    select?: EmploymentRoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the EmploymentRole
     */
    omit?: EmploymentRoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EmploymentRoleInclude<ExtArgs> | null
    /**
     * Filter, which EmploymentRole to fetch.
     */
    where: EmploymentRoleWhereUniqueInput
  }

  /**
   * EmploymentRole findFirst
   */
  export type EmploymentRoleFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EmploymentRole
     */
    select?: EmploymentRoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the EmploymentRole
     */
    omit?: EmploymentRoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EmploymentRoleInclude<ExtArgs> | null
    /**
     * Filter, which EmploymentRole to fetch.
     */
    where?: EmploymentRoleWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of EmploymentRoles to fetch.
     */
    orderBy?: EmploymentRoleOrderByWithRelationInput | EmploymentRoleOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for EmploymentRoles.
     */
    cursor?: EmploymentRoleWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` EmploymentRoles from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` EmploymentRoles.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of EmploymentRoles.
     */
    distinct?: EmploymentRoleScalarFieldEnum | EmploymentRoleScalarFieldEnum[]
  }

  /**
   * EmploymentRole findFirstOrThrow
   */
  export type EmploymentRoleFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EmploymentRole
     */
    select?: EmploymentRoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the EmploymentRole
     */
    omit?: EmploymentRoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EmploymentRoleInclude<ExtArgs> | null
    /**
     * Filter, which EmploymentRole to fetch.
     */
    where?: EmploymentRoleWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of EmploymentRoles to fetch.
     */
    orderBy?: EmploymentRoleOrderByWithRelationInput | EmploymentRoleOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for EmploymentRoles.
     */
    cursor?: EmploymentRoleWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` EmploymentRoles from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` EmploymentRoles.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of EmploymentRoles.
     */
    distinct?: EmploymentRoleScalarFieldEnum | EmploymentRoleScalarFieldEnum[]
  }

  /**
   * EmploymentRole findMany
   */
  export type EmploymentRoleFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EmploymentRole
     */
    select?: EmploymentRoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the EmploymentRole
     */
    omit?: EmploymentRoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EmploymentRoleInclude<ExtArgs> | null
    /**
     * Filter, which EmploymentRoles to fetch.
     */
    where?: EmploymentRoleWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of EmploymentRoles to fetch.
     */
    orderBy?: EmploymentRoleOrderByWithRelationInput | EmploymentRoleOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing EmploymentRoles.
     */
    cursor?: EmploymentRoleWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` EmploymentRoles from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` EmploymentRoles.
     */
    skip?: number
    distinct?: EmploymentRoleScalarFieldEnum | EmploymentRoleScalarFieldEnum[]
  }

  /**
   * EmploymentRole create
   */
  export type EmploymentRoleCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EmploymentRole
     */
    select?: EmploymentRoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the EmploymentRole
     */
    omit?: EmploymentRoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EmploymentRoleInclude<ExtArgs> | null
    /**
     * The data needed to create a EmploymentRole.
     */
    data: XOR<EmploymentRoleCreateInput, EmploymentRoleUncheckedCreateInput>
  }

  /**
   * EmploymentRole createMany
   */
  export type EmploymentRoleCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many EmploymentRoles.
     */
    data: EmploymentRoleCreateManyInput | EmploymentRoleCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * EmploymentRole update
   */
  export type EmploymentRoleUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EmploymentRole
     */
    select?: EmploymentRoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the EmploymentRole
     */
    omit?: EmploymentRoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EmploymentRoleInclude<ExtArgs> | null
    /**
     * The data needed to update a EmploymentRole.
     */
    data: XOR<EmploymentRoleUpdateInput, EmploymentRoleUncheckedUpdateInput>
    /**
     * Choose, which EmploymentRole to update.
     */
    where: EmploymentRoleWhereUniqueInput
  }

  /**
   * EmploymentRole updateMany
   */
  export type EmploymentRoleUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update EmploymentRoles.
     */
    data: XOR<EmploymentRoleUpdateManyMutationInput, EmploymentRoleUncheckedUpdateManyInput>
    /**
     * Filter which EmploymentRoles to update
     */
    where?: EmploymentRoleWhereInput
    /**
     * Limit how many EmploymentRoles to update.
     */
    limit?: number
  }

  /**
   * EmploymentRole upsert
   */
  export type EmploymentRoleUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EmploymentRole
     */
    select?: EmploymentRoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the EmploymentRole
     */
    omit?: EmploymentRoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EmploymentRoleInclude<ExtArgs> | null
    /**
     * The filter to search for the EmploymentRole to update in case it exists.
     */
    where: EmploymentRoleWhereUniqueInput
    /**
     * In case the EmploymentRole found by the `where` argument doesn't exist, create a new EmploymentRole with this data.
     */
    create: XOR<EmploymentRoleCreateInput, EmploymentRoleUncheckedCreateInput>
    /**
     * In case the EmploymentRole was found with the provided `where` argument, update it with this data.
     */
    update: XOR<EmploymentRoleUpdateInput, EmploymentRoleUncheckedUpdateInput>
  }

  /**
   * EmploymentRole delete
   */
  export type EmploymentRoleDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EmploymentRole
     */
    select?: EmploymentRoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the EmploymentRole
     */
    omit?: EmploymentRoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EmploymentRoleInclude<ExtArgs> | null
    /**
     * Filter which EmploymentRole to delete.
     */
    where: EmploymentRoleWhereUniqueInput
  }

  /**
   * EmploymentRole deleteMany
   */
  export type EmploymentRoleDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which EmploymentRoles to delete
     */
    where?: EmploymentRoleWhereInput
    /**
     * Limit how many EmploymentRoles to delete.
     */
    limit?: number
  }

  /**
   * EmploymentRole without action
   */
  export type EmploymentRoleDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the EmploymentRole
     */
    select?: EmploymentRoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the EmploymentRole
     */
    omit?: EmploymentRoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: EmploymentRoleInclude<ExtArgs> | null
  }


  /**
   * Model OrganizationRole
   */

  export type AggregateOrganizationRole = {
    _count: OrganizationRoleCountAggregateOutputType | null
    _avg: OrganizationRoleAvgAggregateOutputType | null
    _sum: OrganizationRoleSumAggregateOutputType | null
    _min: OrganizationRoleMinAggregateOutputType | null
    _max: OrganizationRoleMaxAggregateOutputType | null
  }

  export type OrganizationRoleAvgAggregateOutputType = {
    organizationId: number | null
    roleId: number | null
  }

  export type OrganizationRoleSumAggregateOutputType = {
    organizationId: number | null
    roleId: number | null
  }

  export type OrganizationRoleMinAggregateOutputType = {
    organizationId: number | null
    roleId: number | null
  }

  export type OrganizationRoleMaxAggregateOutputType = {
    organizationId: number | null
    roleId: number | null
  }

  export type OrganizationRoleCountAggregateOutputType = {
    organizationId: number
    roleId: number
    _all: number
  }


  export type OrganizationRoleAvgAggregateInputType = {
    organizationId?: true
    roleId?: true
  }

  export type OrganizationRoleSumAggregateInputType = {
    organizationId?: true
    roleId?: true
  }

  export type OrganizationRoleMinAggregateInputType = {
    organizationId?: true
    roleId?: true
  }

  export type OrganizationRoleMaxAggregateInputType = {
    organizationId?: true
    roleId?: true
  }

  export type OrganizationRoleCountAggregateInputType = {
    organizationId?: true
    roleId?: true
    _all?: true
  }

  export type OrganizationRoleAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which OrganizationRole to aggregate.
     */
    where?: OrganizationRoleWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of OrganizationRoles to fetch.
     */
    orderBy?: OrganizationRoleOrderByWithRelationInput | OrganizationRoleOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: OrganizationRoleWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` OrganizationRoles from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` OrganizationRoles.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned OrganizationRoles
    **/
    _count?: true | OrganizationRoleCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: OrganizationRoleAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: OrganizationRoleSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: OrganizationRoleMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: OrganizationRoleMaxAggregateInputType
  }

  export type GetOrganizationRoleAggregateType<T extends OrganizationRoleAggregateArgs> = {
        [P in keyof T & keyof AggregateOrganizationRole]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateOrganizationRole[P]>
      : GetScalarType<T[P], AggregateOrganizationRole[P]>
  }




  export type OrganizationRoleGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: OrganizationRoleWhereInput
    orderBy?: OrganizationRoleOrderByWithAggregationInput | OrganizationRoleOrderByWithAggregationInput[]
    by: OrganizationRoleScalarFieldEnum[] | OrganizationRoleScalarFieldEnum
    having?: OrganizationRoleScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: OrganizationRoleCountAggregateInputType | true
    _avg?: OrganizationRoleAvgAggregateInputType
    _sum?: OrganizationRoleSumAggregateInputType
    _min?: OrganizationRoleMinAggregateInputType
    _max?: OrganizationRoleMaxAggregateInputType
  }

  export type OrganizationRoleGroupByOutputType = {
    organizationId: number
    roleId: number
    _count: OrganizationRoleCountAggregateOutputType | null
    _avg: OrganizationRoleAvgAggregateOutputType | null
    _sum: OrganizationRoleSumAggregateOutputType | null
    _min: OrganizationRoleMinAggregateOutputType | null
    _max: OrganizationRoleMaxAggregateOutputType | null
  }

  type GetOrganizationRoleGroupByPayload<T extends OrganizationRoleGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<OrganizationRoleGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof OrganizationRoleGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], OrganizationRoleGroupByOutputType[P]>
            : GetScalarType<T[P], OrganizationRoleGroupByOutputType[P]>
        }
      >
    >


  export type OrganizationRoleSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    organizationId?: boolean
    roleId?: boolean
    organization?: boolean | OrganizationDefaultArgs<ExtArgs>
    role?: boolean | RoleDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["organizationRole"]>



  export type OrganizationRoleSelectScalar = {
    organizationId?: boolean
    roleId?: boolean
  }

  export type OrganizationRoleOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"organizationId" | "roleId", ExtArgs["result"]["organizationRole"]>
  export type OrganizationRoleInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    organization?: boolean | OrganizationDefaultArgs<ExtArgs>
    role?: boolean | RoleDefaultArgs<ExtArgs>
  }

  export type $OrganizationRolePayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "OrganizationRole"
    objects: {
      organization: Prisma.$OrganizationPayload<ExtArgs>
      role: Prisma.$RolePayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      organizationId: number
      roleId: number
    }, ExtArgs["result"]["organizationRole"]>
    composites: {}
  }

  type OrganizationRoleGetPayload<S extends boolean | null | undefined | OrganizationRoleDefaultArgs> = $Result.GetResult<Prisma.$OrganizationRolePayload, S>

  type OrganizationRoleCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<OrganizationRoleFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: OrganizationRoleCountAggregateInputType | true
    }

  export interface OrganizationRoleDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['OrganizationRole'], meta: { name: 'OrganizationRole' } }
    /**
     * Find zero or one OrganizationRole that matches the filter.
     * @param {OrganizationRoleFindUniqueArgs} args - Arguments to find a OrganizationRole
     * @example
     * // Get one OrganizationRole
     * const organizationRole = await prisma.organizationRole.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends OrganizationRoleFindUniqueArgs>(args: SelectSubset<T, OrganizationRoleFindUniqueArgs<ExtArgs>>): Prisma__OrganizationRoleClient<$Result.GetResult<Prisma.$OrganizationRolePayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one OrganizationRole that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {OrganizationRoleFindUniqueOrThrowArgs} args - Arguments to find a OrganizationRole
     * @example
     * // Get one OrganizationRole
     * const organizationRole = await prisma.organizationRole.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends OrganizationRoleFindUniqueOrThrowArgs>(args: SelectSubset<T, OrganizationRoleFindUniqueOrThrowArgs<ExtArgs>>): Prisma__OrganizationRoleClient<$Result.GetResult<Prisma.$OrganizationRolePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first OrganizationRole that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OrganizationRoleFindFirstArgs} args - Arguments to find a OrganizationRole
     * @example
     * // Get one OrganizationRole
     * const organizationRole = await prisma.organizationRole.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends OrganizationRoleFindFirstArgs>(args?: SelectSubset<T, OrganizationRoleFindFirstArgs<ExtArgs>>): Prisma__OrganizationRoleClient<$Result.GetResult<Prisma.$OrganizationRolePayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first OrganizationRole that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OrganizationRoleFindFirstOrThrowArgs} args - Arguments to find a OrganizationRole
     * @example
     * // Get one OrganizationRole
     * const organizationRole = await prisma.organizationRole.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends OrganizationRoleFindFirstOrThrowArgs>(args?: SelectSubset<T, OrganizationRoleFindFirstOrThrowArgs<ExtArgs>>): Prisma__OrganizationRoleClient<$Result.GetResult<Prisma.$OrganizationRolePayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more OrganizationRoles that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OrganizationRoleFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all OrganizationRoles
     * const organizationRoles = await prisma.organizationRole.findMany()
     * 
     * // Get first 10 OrganizationRoles
     * const organizationRoles = await prisma.organizationRole.findMany({ take: 10 })
     * 
     * // Only select the `organizationId`
     * const organizationRoleWithOrganizationIdOnly = await prisma.organizationRole.findMany({ select: { organizationId: true } })
     * 
     */
    findMany<T extends OrganizationRoleFindManyArgs>(args?: SelectSubset<T, OrganizationRoleFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$OrganizationRolePayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a OrganizationRole.
     * @param {OrganizationRoleCreateArgs} args - Arguments to create a OrganizationRole.
     * @example
     * // Create one OrganizationRole
     * const OrganizationRole = await prisma.organizationRole.create({
     *   data: {
     *     // ... data to create a OrganizationRole
     *   }
     * })
     * 
     */
    create<T extends OrganizationRoleCreateArgs>(args: SelectSubset<T, OrganizationRoleCreateArgs<ExtArgs>>): Prisma__OrganizationRoleClient<$Result.GetResult<Prisma.$OrganizationRolePayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many OrganizationRoles.
     * @param {OrganizationRoleCreateManyArgs} args - Arguments to create many OrganizationRoles.
     * @example
     * // Create many OrganizationRoles
     * const organizationRole = await prisma.organizationRole.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends OrganizationRoleCreateManyArgs>(args?: SelectSubset<T, OrganizationRoleCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Delete a OrganizationRole.
     * @param {OrganizationRoleDeleteArgs} args - Arguments to delete one OrganizationRole.
     * @example
     * // Delete one OrganizationRole
     * const OrganizationRole = await prisma.organizationRole.delete({
     *   where: {
     *     // ... filter to delete one OrganizationRole
     *   }
     * })
     * 
     */
    delete<T extends OrganizationRoleDeleteArgs>(args: SelectSubset<T, OrganizationRoleDeleteArgs<ExtArgs>>): Prisma__OrganizationRoleClient<$Result.GetResult<Prisma.$OrganizationRolePayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one OrganizationRole.
     * @param {OrganizationRoleUpdateArgs} args - Arguments to update one OrganizationRole.
     * @example
     * // Update one OrganizationRole
     * const organizationRole = await prisma.organizationRole.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends OrganizationRoleUpdateArgs>(args: SelectSubset<T, OrganizationRoleUpdateArgs<ExtArgs>>): Prisma__OrganizationRoleClient<$Result.GetResult<Prisma.$OrganizationRolePayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more OrganizationRoles.
     * @param {OrganizationRoleDeleteManyArgs} args - Arguments to filter OrganizationRoles to delete.
     * @example
     * // Delete a few OrganizationRoles
     * const { count } = await prisma.organizationRole.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends OrganizationRoleDeleteManyArgs>(args?: SelectSubset<T, OrganizationRoleDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more OrganizationRoles.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OrganizationRoleUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many OrganizationRoles
     * const organizationRole = await prisma.organizationRole.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends OrganizationRoleUpdateManyArgs>(args: SelectSubset<T, OrganizationRoleUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one OrganizationRole.
     * @param {OrganizationRoleUpsertArgs} args - Arguments to update or create a OrganizationRole.
     * @example
     * // Update or create a OrganizationRole
     * const organizationRole = await prisma.organizationRole.upsert({
     *   create: {
     *     // ... data to create a OrganizationRole
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the OrganizationRole we want to update
     *   }
     * })
     */
    upsert<T extends OrganizationRoleUpsertArgs>(args: SelectSubset<T, OrganizationRoleUpsertArgs<ExtArgs>>): Prisma__OrganizationRoleClient<$Result.GetResult<Prisma.$OrganizationRolePayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of OrganizationRoles.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OrganizationRoleCountArgs} args - Arguments to filter OrganizationRoles to count.
     * @example
     * // Count the number of OrganizationRoles
     * const count = await prisma.organizationRole.count({
     *   where: {
     *     // ... the filter for the OrganizationRoles we want to count
     *   }
     * })
    **/
    count<T extends OrganizationRoleCountArgs>(
      args?: Subset<T, OrganizationRoleCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], OrganizationRoleCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a OrganizationRole.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OrganizationRoleAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends OrganizationRoleAggregateArgs>(args: Subset<T, OrganizationRoleAggregateArgs>): Prisma.PrismaPromise<GetOrganizationRoleAggregateType<T>>

    /**
     * Group by OrganizationRole.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {OrganizationRoleGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends OrganizationRoleGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: OrganizationRoleGroupByArgs['orderBy'] }
        : { orderBy?: OrganizationRoleGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, OrganizationRoleGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetOrganizationRoleGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the OrganizationRole model
   */
  readonly fields: OrganizationRoleFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for OrganizationRole.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__OrganizationRoleClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    organization<T extends OrganizationDefaultArgs<ExtArgs> = {}>(args?: Subset<T, OrganizationDefaultArgs<ExtArgs>>): Prisma__OrganizationClient<$Result.GetResult<Prisma.$OrganizationPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    role<T extends RoleDefaultArgs<ExtArgs> = {}>(args?: Subset<T, RoleDefaultArgs<ExtArgs>>): Prisma__RoleClient<$Result.GetResult<Prisma.$RolePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the OrganizationRole model
   */
  interface OrganizationRoleFieldRefs {
    readonly organizationId: FieldRef<"OrganizationRole", 'Int'>
    readonly roleId: FieldRef<"OrganizationRole", 'Int'>
  }
    

  // Custom InputTypes
  /**
   * OrganizationRole findUnique
   */
  export type OrganizationRoleFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OrganizationRole
     */
    select?: OrganizationRoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the OrganizationRole
     */
    omit?: OrganizationRoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OrganizationRoleInclude<ExtArgs> | null
    /**
     * Filter, which OrganizationRole to fetch.
     */
    where: OrganizationRoleWhereUniqueInput
  }

  /**
   * OrganizationRole findUniqueOrThrow
   */
  export type OrganizationRoleFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OrganizationRole
     */
    select?: OrganizationRoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the OrganizationRole
     */
    omit?: OrganizationRoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OrganizationRoleInclude<ExtArgs> | null
    /**
     * Filter, which OrganizationRole to fetch.
     */
    where: OrganizationRoleWhereUniqueInput
  }

  /**
   * OrganizationRole findFirst
   */
  export type OrganizationRoleFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OrganizationRole
     */
    select?: OrganizationRoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the OrganizationRole
     */
    omit?: OrganizationRoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OrganizationRoleInclude<ExtArgs> | null
    /**
     * Filter, which OrganizationRole to fetch.
     */
    where?: OrganizationRoleWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of OrganizationRoles to fetch.
     */
    orderBy?: OrganizationRoleOrderByWithRelationInput | OrganizationRoleOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for OrganizationRoles.
     */
    cursor?: OrganizationRoleWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` OrganizationRoles from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` OrganizationRoles.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of OrganizationRoles.
     */
    distinct?: OrganizationRoleScalarFieldEnum | OrganizationRoleScalarFieldEnum[]
  }

  /**
   * OrganizationRole findFirstOrThrow
   */
  export type OrganizationRoleFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OrganizationRole
     */
    select?: OrganizationRoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the OrganizationRole
     */
    omit?: OrganizationRoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OrganizationRoleInclude<ExtArgs> | null
    /**
     * Filter, which OrganizationRole to fetch.
     */
    where?: OrganizationRoleWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of OrganizationRoles to fetch.
     */
    orderBy?: OrganizationRoleOrderByWithRelationInput | OrganizationRoleOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for OrganizationRoles.
     */
    cursor?: OrganizationRoleWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` OrganizationRoles from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` OrganizationRoles.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of OrganizationRoles.
     */
    distinct?: OrganizationRoleScalarFieldEnum | OrganizationRoleScalarFieldEnum[]
  }

  /**
   * OrganizationRole findMany
   */
  export type OrganizationRoleFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OrganizationRole
     */
    select?: OrganizationRoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the OrganizationRole
     */
    omit?: OrganizationRoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OrganizationRoleInclude<ExtArgs> | null
    /**
     * Filter, which OrganizationRoles to fetch.
     */
    where?: OrganizationRoleWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of OrganizationRoles to fetch.
     */
    orderBy?: OrganizationRoleOrderByWithRelationInput | OrganizationRoleOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing OrganizationRoles.
     */
    cursor?: OrganizationRoleWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` OrganizationRoles from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` OrganizationRoles.
     */
    skip?: number
    distinct?: OrganizationRoleScalarFieldEnum | OrganizationRoleScalarFieldEnum[]
  }

  /**
   * OrganizationRole create
   */
  export type OrganizationRoleCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OrganizationRole
     */
    select?: OrganizationRoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the OrganizationRole
     */
    omit?: OrganizationRoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OrganizationRoleInclude<ExtArgs> | null
    /**
     * The data needed to create a OrganizationRole.
     */
    data: XOR<OrganizationRoleCreateInput, OrganizationRoleUncheckedCreateInput>
  }

  /**
   * OrganizationRole createMany
   */
  export type OrganizationRoleCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many OrganizationRoles.
     */
    data: OrganizationRoleCreateManyInput | OrganizationRoleCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * OrganizationRole update
   */
  export type OrganizationRoleUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OrganizationRole
     */
    select?: OrganizationRoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the OrganizationRole
     */
    omit?: OrganizationRoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OrganizationRoleInclude<ExtArgs> | null
    /**
     * The data needed to update a OrganizationRole.
     */
    data: XOR<OrganizationRoleUpdateInput, OrganizationRoleUncheckedUpdateInput>
    /**
     * Choose, which OrganizationRole to update.
     */
    where: OrganizationRoleWhereUniqueInput
  }

  /**
   * OrganizationRole updateMany
   */
  export type OrganizationRoleUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update OrganizationRoles.
     */
    data: XOR<OrganizationRoleUpdateManyMutationInput, OrganizationRoleUncheckedUpdateManyInput>
    /**
     * Filter which OrganizationRoles to update
     */
    where?: OrganizationRoleWhereInput
    /**
     * Limit how many OrganizationRoles to update.
     */
    limit?: number
  }

  /**
   * OrganizationRole upsert
   */
  export type OrganizationRoleUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OrganizationRole
     */
    select?: OrganizationRoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the OrganizationRole
     */
    omit?: OrganizationRoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OrganizationRoleInclude<ExtArgs> | null
    /**
     * The filter to search for the OrganizationRole to update in case it exists.
     */
    where: OrganizationRoleWhereUniqueInput
    /**
     * In case the OrganizationRole found by the `where` argument doesn't exist, create a new OrganizationRole with this data.
     */
    create: XOR<OrganizationRoleCreateInput, OrganizationRoleUncheckedCreateInput>
    /**
     * In case the OrganizationRole was found with the provided `where` argument, update it with this data.
     */
    update: XOR<OrganizationRoleUpdateInput, OrganizationRoleUncheckedUpdateInput>
  }

  /**
   * OrganizationRole delete
   */
  export type OrganizationRoleDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OrganizationRole
     */
    select?: OrganizationRoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the OrganizationRole
     */
    omit?: OrganizationRoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OrganizationRoleInclude<ExtArgs> | null
    /**
     * Filter which OrganizationRole to delete.
     */
    where: OrganizationRoleWhereUniqueInput
  }

  /**
   * OrganizationRole deleteMany
   */
  export type OrganizationRoleDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which OrganizationRoles to delete
     */
    where?: OrganizationRoleWhereInput
    /**
     * Limit how many OrganizationRoles to delete.
     */
    limit?: number
  }

  /**
   * OrganizationRole without action
   */
  export type OrganizationRoleDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the OrganizationRole
     */
    select?: OrganizationRoleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the OrganizationRole
     */
    omit?: OrganizationRoleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: OrganizationRoleInclude<ExtArgs> | null
  }


  /**
   * Model AuthObject
   */

  export type AggregateAuthObject = {
    _count: AuthObjectCountAggregateOutputType | null
    _avg: AuthObjectAvgAggregateOutputType | null
    _sum: AuthObjectSumAggregateOutputType | null
    _min: AuthObjectMinAggregateOutputType | null
    _max: AuthObjectMaxAggregateOutputType | null
  }

  export type AuthObjectAvgAggregateOutputType = {
    id: number | null
  }

  export type AuthObjectSumAggregateOutputType = {
    id: number | null
  }

  export type AuthObjectMinAggregateOutputType = {
    id: number | null
    objectCode: string | null
    objectName: string | null
    objectType: string | null
    path: string | null
  }

  export type AuthObjectMaxAggregateOutputType = {
    id: number | null
    objectCode: string | null
    objectName: string | null
    objectType: string | null
    path: string | null
  }

  export type AuthObjectCountAggregateOutputType = {
    id: number
    objectCode: number
    objectName: number
    objectType: number
    path: number
    authFields: number
    _all: number
  }


  export type AuthObjectAvgAggregateInputType = {
    id?: true
  }

  export type AuthObjectSumAggregateInputType = {
    id?: true
  }

  export type AuthObjectMinAggregateInputType = {
    id?: true
    objectCode?: true
    objectName?: true
    objectType?: true
    path?: true
  }

  export type AuthObjectMaxAggregateInputType = {
    id?: true
    objectCode?: true
    objectName?: true
    objectType?: true
    path?: true
  }

  export type AuthObjectCountAggregateInputType = {
    id?: true
    objectCode?: true
    objectName?: true
    objectType?: true
    path?: true
    authFields?: true
    _all?: true
  }

  export type AuthObjectAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which AuthObject to aggregate.
     */
    where?: AuthObjectWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of AuthObjects to fetch.
     */
    orderBy?: AuthObjectOrderByWithRelationInput | AuthObjectOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: AuthObjectWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` AuthObjects from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` AuthObjects.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned AuthObjects
    **/
    _count?: true | AuthObjectCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: AuthObjectAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: AuthObjectSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: AuthObjectMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: AuthObjectMaxAggregateInputType
  }

  export type GetAuthObjectAggregateType<T extends AuthObjectAggregateArgs> = {
        [P in keyof T & keyof AggregateAuthObject]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateAuthObject[P]>
      : GetScalarType<T[P], AggregateAuthObject[P]>
  }




  export type AuthObjectGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: AuthObjectWhereInput
    orderBy?: AuthObjectOrderByWithAggregationInput | AuthObjectOrderByWithAggregationInput[]
    by: AuthObjectScalarFieldEnum[] | AuthObjectScalarFieldEnum
    having?: AuthObjectScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: AuthObjectCountAggregateInputType | true
    _avg?: AuthObjectAvgAggregateInputType
    _sum?: AuthObjectSumAggregateInputType
    _min?: AuthObjectMinAggregateInputType
    _max?: AuthObjectMaxAggregateInputType
  }

  export type AuthObjectGroupByOutputType = {
    id: number
    objectCode: string
    objectName: string
    objectType: string
    path: string | null
    authFields: JsonValue | null
    _count: AuthObjectCountAggregateOutputType | null
    _avg: AuthObjectAvgAggregateOutputType | null
    _sum: AuthObjectSumAggregateOutputType | null
    _min: AuthObjectMinAggregateOutputType | null
    _max: AuthObjectMaxAggregateOutputType | null
  }

  type GetAuthObjectGroupByPayload<T extends AuthObjectGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<AuthObjectGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof AuthObjectGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], AuthObjectGroupByOutputType[P]>
            : GetScalarType<T[P], AuthObjectGroupByOutputType[P]>
        }
      >
    >


  export type AuthObjectSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    objectCode?: boolean
    objectName?: boolean
    objectType?: boolean
    path?: boolean
    authFields?: boolean
    privileges?: boolean | AuthObject$privilegesArgs<ExtArgs>
    _count?: boolean | AuthObjectCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["authObject"]>



  export type AuthObjectSelectScalar = {
    id?: boolean
    objectCode?: boolean
    objectName?: boolean
    objectType?: boolean
    path?: boolean
    authFields?: boolean
  }

  export type AuthObjectOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "objectCode" | "objectName" | "objectType" | "path" | "authFields", ExtArgs["result"]["authObject"]>
  export type AuthObjectInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    privileges?: boolean | AuthObject$privilegesArgs<ExtArgs>
    _count?: boolean | AuthObjectCountOutputTypeDefaultArgs<ExtArgs>
  }

  export type $AuthObjectPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "AuthObject"
    objects: {
      privileges: Prisma.$PrivilegePayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: number
      objectCode: string
      objectName: string
      objectType: string
      path: string | null
      authFields: Prisma.JsonValue | null
    }, ExtArgs["result"]["authObject"]>
    composites: {}
  }

  type AuthObjectGetPayload<S extends boolean | null | undefined | AuthObjectDefaultArgs> = $Result.GetResult<Prisma.$AuthObjectPayload, S>

  type AuthObjectCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<AuthObjectFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: AuthObjectCountAggregateInputType | true
    }

  export interface AuthObjectDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['AuthObject'], meta: { name: 'AuthObject' } }
    /**
     * Find zero or one AuthObject that matches the filter.
     * @param {AuthObjectFindUniqueArgs} args - Arguments to find a AuthObject
     * @example
     * // Get one AuthObject
     * const authObject = await prisma.authObject.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends AuthObjectFindUniqueArgs>(args: SelectSubset<T, AuthObjectFindUniqueArgs<ExtArgs>>): Prisma__AuthObjectClient<$Result.GetResult<Prisma.$AuthObjectPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one AuthObject that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {AuthObjectFindUniqueOrThrowArgs} args - Arguments to find a AuthObject
     * @example
     * // Get one AuthObject
     * const authObject = await prisma.authObject.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends AuthObjectFindUniqueOrThrowArgs>(args: SelectSubset<T, AuthObjectFindUniqueOrThrowArgs<ExtArgs>>): Prisma__AuthObjectClient<$Result.GetResult<Prisma.$AuthObjectPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first AuthObject that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AuthObjectFindFirstArgs} args - Arguments to find a AuthObject
     * @example
     * // Get one AuthObject
     * const authObject = await prisma.authObject.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends AuthObjectFindFirstArgs>(args?: SelectSubset<T, AuthObjectFindFirstArgs<ExtArgs>>): Prisma__AuthObjectClient<$Result.GetResult<Prisma.$AuthObjectPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first AuthObject that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AuthObjectFindFirstOrThrowArgs} args - Arguments to find a AuthObject
     * @example
     * // Get one AuthObject
     * const authObject = await prisma.authObject.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends AuthObjectFindFirstOrThrowArgs>(args?: SelectSubset<T, AuthObjectFindFirstOrThrowArgs<ExtArgs>>): Prisma__AuthObjectClient<$Result.GetResult<Prisma.$AuthObjectPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more AuthObjects that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AuthObjectFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all AuthObjects
     * const authObjects = await prisma.authObject.findMany()
     * 
     * // Get first 10 AuthObjects
     * const authObjects = await prisma.authObject.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const authObjectWithIdOnly = await prisma.authObject.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends AuthObjectFindManyArgs>(args?: SelectSubset<T, AuthObjectFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$AuthObjectPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a AuthObject.
     * @param {AuthObjectCreateArgs} args - Arguments to create a AuthObject.
     * @example
     * // Create one AuthObject
     * const AuthObject = await prisma.authObject.create({
     *   data: {
     *     // ... data to create a AuthObject
     *   }
     * })
     * 
     */
    create<T extends AuthObjectCreateArgs>(args: SelectSubset<T, AuthObjectCreateArgs<ExtArgs>>): Prisma__AuthObjectClient<$Result.GetResult<Prisma.$AuthObjectPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many AuthObjects.
     * @param {AuthObjectCreateManyArgs} args - Arguments to create many AuthObjects.
     * @example
     * // Create many AuthObjects
     * const authObject = await prisma.authObject.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends AuthObjectCreateManyArgs>(args?: SelectSubset<T, AuthObjectCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Delete a AuthObject.
     * @param {AuthObjectDeleteArgs} args - Arguments to delete one AuthObject.
     * @example
     * // Delete one AuthObject
     * const AuthObject = await prisma.authObject.delete({
     *   where: {
     *     // ... filter to delete one AuthObject
     *   }
     * })
     * 
     */
    delete<T extends AuthObjectDeleteArgs>(args: SelectSubset<T, AuthObjectDeleteArgs<ExtArgs>>): Prisma__AuthObjectClient<$Result.GetResult<Prisma.$AuthObjectPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one AuthObject.
     * @param {AuthObjectUpdateArgs} args - Arguments to update one AuthObject.
     * @example
     * // Update one AuthObject
     * const authObject = await prisma.authObject.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends AuthObjectUpdateArgs>(args: SelectSubset<T, AuthObjectUpdateArgs<ExtArgs>>): Prisma__AuthObjectClient<$Result.GetResult<Prisma.$AuthObjectPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more AuthObjects.
     * @param {AuthObjectDeleteManyArgs} args - Arguments to filter AuthObjects to delete.
     * @example
     * // Delete a few AuthObjects
     * const { count } = await prisma.authObject.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends AuthObjectDeleteManyArgs>(args?: SelectSubset<T, AuthObjectDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more AuthObjects.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AuthObjectUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many AuthObjects
     * const authObject = await prisma.authObject.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends AuthObjectUpdateManyArgs>(args: SelectSubset<T, AuthObjectUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one AuthObject.
     * @param {AuthObjectUpsertArgs} args - Arguments to update or create a AuthObject.
     * @example
     * // Update or create a AuthObject
     * const authObject = await prisma.authObject.upsert({
     *   create: {
     *     // ... data to create a AuthObject
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the AuthObject we want to update
     *   }
     * })
     */
    upsert<T extends AuthObjectUpsertArgs>(args: SelectSubset<T, AuthObjectUpsertArgs<ExtArgs>>): Prisma__AuthObjectClient<$Result.GetResult<Prisma.$AuthObjectPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of AuthObjects.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AuthObjectCountArgs} args - Arguments to filter AuthObjects to count.
     * @example
     * // Count the number of AuthObjects
     * const count = await prisma.authObject.count({
     *   where: {
     *     // ... the filter for the AuthObjects we want to count
     *   }
     * })
    **/
    count<T extends AuthObjectCountArgs>(
      args?: Subset<T, AuthObjectCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], AuthObjectCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a AuthObject.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AuthObjectAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends AuthObjectAggregateArgs>(args: Subset<T, AuthObjectAggregateArgs>): Prisma.PrismaPromise<GetAuthObjectAggregateType<T>>

    /**
     * Group by AuthObject.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {AuthObjectGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends AuthObjectGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: AuthObjectGroupByArgs['orderBy'] }
        : { orderBy?: AuthObjectGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, AuthObjectGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetAuthObjectGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the AuthObject model
   */
  readonly fields: AuthObjectFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for AuthObject.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__AuthObjectClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    privileges<T extends AuthObject$privilegesArgs<ExtArgs> = {}>(args?: Subset<T, AuthObject$privilegesArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$PrivilegePayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the AuthObject model
   */
  interface AuthObjectFieldRefs {
    readonly id: FieldRef<"AuthObject", 'Int'>
    readonly objectCode: FieldRef<"AuthObject", 'String'>
    readonly objectName: FieldRef<"AuthObject", 'String'>
    readonly objectType: FieldRef<"AuthObject", 'String'>
    readonly path: FieldRef<"AuthObject", 'String'>
    readonly authFields: FieldRef<"AuthObject", 'Json'>
  }
    

  // Custom InputTypes
  /**
   * AuthObject findUnique
   */
  export type AuthObjectFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuthObject
     */
    select?: AuthObjectSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuthObject
     */
    omit?: AuthObjectOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AuthObjectInclude<ExtArgs> | null
    /**
     * Filter, which AuthObject to fetch.
     */
    where: AuthObjectWhereUniqueInput
  }

  /**
   * AuthObject findUniqueOrThrow
   */
  export type AuthObjectFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuthObject
     */
    select?: AuthObjectSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuthObject
     */
    omit?: AuthObjectOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AuthObjectInclude<ExtArgs> | null
    /**
     * Filter, which AuthObject to fetch.
     */
    where: AuthObjectWhereUniqueInput
  }

  /**
   * AuthObject findFirst
   */
  export type AuthObjectFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuthObject
     */
    select?: AuthObjectSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuthObject
     */
    omit?: AuthObjectOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AuthObjectInclude<ExtArgs> | null
    /**
     * Filter, which AuthObject to fetch.
     */
    where?: AuthObjectWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of AuthObjects to fetch.
     */
    orderBy?: AuthObjectOrderByWithRelationInput | AuthObjectOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for AuthObjects.
     */
    cursor?: AuthObjectWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` AuthObjects from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` AuthObjects.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of AuthObjects.
     */
    distinct?: AuthObjectScalarFieldEnum | AuthObjectScalarFieldEnum[]
  }

  /**
   * AuthObject findFirstOrThrow
   */
  export type AuthObjectFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuthObject
     */
    select?: AuthObjectSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuthObject
     */
    omit?: AuthObjectOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AuthObjectInclude<ExtArgs> | null
    /**
     * Filter, which AuthObject to fetch.
     */
    where?: AuthObjectWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of AuthObjects to fetch.
     */
    orderBy?: AuthObjectOrderByWithRelationInput | AuthObjectOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for AuthObjects.
     */
    cursor?: AuthObjectWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` AuthObjects from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` AuthObjects.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of AuthObjects.
     */
    distinct?: AuthObjectScalarFieldEnum | AuthObjectScalarFieldEnum[]
  }

  /**
   * AuthObject findMany
   */
  export type AuthObjectFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuthObject
     */
    select?: AuthObjectSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuthObject
     */
    omit?: AuthObjectOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AuthObjectInclude<ExtArgs> | null
    /**
     * Filter, which AuthObjects to fetch.
     */
    where?: AuthObjectWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of AuthObjects to fetch.
     */
    orderBy?: AuthObjectOrderByWithRelationInput | AuthObjectOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing AuthObjects.
     */
    cursor?: AuthObjectWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` AuthObjects from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` AuthObjects.
     */
    skip?: number
    distinct?: AuthObjectScalarFieldEnum | AuthObjectScalarFieldEnum[]
  }

  /**
   * AuthObject create
   */
  export type AuthObjectCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuthObject
     */
    select?: AuthObjectSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuthObject
     */
    omit?: AuthObjectOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AuthObjectInclude<ExtArgs> | null
    /**
     * The data needed to create a AuthObject.
     */
    data: XOR<AuthObjectCreateInput, AuthObjectUncheckedCreateInput>
  }

  /**
   * AuthObject createMany
   */
  export type AuthObjectCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many AuthObjects.
     */
    data: AuthObjectCreateManyInput | AuthObjectCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * AuthObject update
   */
  export type AuthObjectUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuthObject
     */
    select?: AuthObjectSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuthObject
     */
    omit?: AuthObjectOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AuthObjectInclude<ExtArgs> | null
    /**
     * The data needed to update a AuthObject.
     */
    data: XOR<AuthObjectUpdateInput, AuthObjectUncheckedUpdateInput>
    /**
     * Choose, which AuthObject to update.
     */
    where: AuthObjectWhereUniqueInput
  }

  /**
   * AuthObject updateMany
   */
  export type AuthObjectUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update AuthObjects.
     */
    data: XOR<AuthObjectUpdateManyMutationInput, AuthObjectUncheckedUpdateManyInput>
    /**
     * Filter which AuthObjects to update
     */
    where?: AuthObjectWhereInput
    /**
     * Limit how many AuthObjects to update.
     */
    limit?: number
  }

  /**
   * AuthObject upsert
   */
  export type AuthObjectUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuthObject
     */
    select?: AuthObjectSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuthObject
     */
    omit?: AuthObjectOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AuthObjectInclude<ExtArgs> | null
    /**
     * The filter to search for the AuthObject to update in case it exists.
     */
    where: AuthObjectWhereUniqueInput
    /**
     * In case the AuthObject found by the `where` argument doesn't exist, create a new AuthObject with this data.
     */
    create: XOR<AuthObjectCreateInput, AuthObjectUncheckedCreateInput>
    /**
     * In case the AuthObject was found with the provided `where` argument, update it with this data.
     */
    update: XOR<AuthObjectUpdateInput, AuthObjectUncheckedUpdateInput>
  }

  /**
   * AuthObject delete
   */
  export type AuthObjectDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuthObject
     */
    select?: AuthObjectSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuthObject
     */
    omit?: AuthObjectOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AuthObjectInclude<ExtArgs> | null
    /**
     * Filter which AuthObject to delete.
     */
    where: AuthObjectWhereUniqueInput
  }

  /**
   * AuthObject deleteMany
   */
  export type AuthObjectDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which AuthObjects to delete
     */
    where?: AuthObjectWhereInput
    /**
     * Limit how many AuthObjects to delete.
     */
    limit?: number
  }

  /**
   * AuthObject.privileges
   */
  export type AuthObject$privilegesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Privilege
     */
    select?: PrivilegeSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Privilege
     */
    omit?: PrivilegeOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PrivilegeInclude<ExtArgs> | null
    where?: PrivilegeWhereInput
    orderBy?: PrivilegeOrderByWithRelationInput | PrivilegeOrderByWithRelationInput[]
    cursor?: PrivilegeWhereUniqueInput
    take?: number
    skip?: number
    distinct?: PrivilegeScalarFieldEnum | PrivilegeScalarFieldEnum[]
  }

  /**
   * AuthObject without action
   */
  export type AuthObjectDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the AuthObject
     */
    select?: AuthObjectSelect<ExtArgs> | null
    /**
     * Omit specific fields from the AuthObject
     */
    omit?: AuthObjectOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: AuthObjectInclude<ExtArgs> | null
  }


  /**
   * Model Privilege
   */

  export type AggregatePrivilege = {
    _count: PrivilegeCountAggregateOutputType | null
    _avg: PrivilegeAvgAggregateOutputType | null
    _sum: PrivilegeSumAggregateOutputType | null
    _min: PrivilegeMinAggregateOutputType | null
    _max: PrivilegeMaxAggregateOutputType | null
  }

  export type PrivilegeAvgAggregateOutputType = {
    id: number | null
    objectId: number | null
    status: number | null
  }

  export type PrivilegeSumAggregateOutputType = {
    id: number | null
    objectId: number | null
    status: number | null
  }

  export type PrivilegeMinAggregateOutputType = {
    id: number | null
    privilegeCode: string | null
    privilegeName: string | null
    objectId: number | null
    status: number | null
    description: string | null
    isDelete: boolean | null
    createTime: Date | null
    updateTime: Date | null
  }

  export type PrivilegeMaxAggregateOutputType = {
    id: number | null
    privilegeCode: string | null
    privilegeName: string | null
    objectId: number | null
    status: number | null
    description: string | null
    isDelete: boolean | null
    createTime: Date | null
    updateTime: Date | null
  }

  export type PrivilegeCountAggregateOutputType = {
    id: number
    privilegeCode: number
    privilegeName: number
    objectId: number
    fieldValues: number
    status: number
    description: number
    isDelete: number
    createTime: number
    updateTime: number
    _all: number
  }


  export type PrivilegeAvgAggregateInputType = {
    id?: true
    objectId?: true
    status?: true
  }

  export type PrivilegeSumAggregateInputType = {
    id?: true
    objectId?: true
    status?: true
  }

  export type PrivilegeMinAggregateInputType = {
    id?: true
    privilegeCode?: true
    privilegeName?: true
    objectId?: true
    status?: true
    description?: true
    isDelete?: true
    createTime?: true
    updateTime?: true
  }

  export type PrivilegeMaxAggregateInputType = {
    id?: true
    privilegeCode?: true
    privilegeName?: true
    objectId?: true
    status?: true
    description?: true
    isDelete?: true
    createTime?: true
    updateTime?: true
  }

  export type PrivilegeCountAggregateInputType = {
    id?: true
    privilegeCode?: true
    privilegeName?: true
    objectId?: true
    fieldValues?: true
    status?: true
    description?: true
    isDelete?: true
    createTime?: true
    updateTime?: true
    _all?: true
  }

  export type PrivilegeAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Privilege to aggregate.
     */
    where?: PrivilegeWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Privileges to fetch.
     */
    orderBy?: PrivilegeOrderByWithRelationInput | PrivilegeOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: PrivilegeWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Privileges from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Privileges.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Privileges
    **/
    _count?: true | PrivilegeCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: PrivilegeAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: PrivilegeSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: PrivilegeMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: PrivilegeMaxAggregateInputType
  }

  export type GetPrivilegeAggregateType<T extends PrivilegeAggregateArgs> = {
        [P in keyof T & keyof AggregatePrivilege]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregatePrivilege[P]>
      : GetScalarType<T[P], AggregatePrivilege[P]>
  }




  export type PrivilegeGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: PrivilegeWhereInput
    orderBy?: PrivilegeOrderByWithAggregationInput | PrivilegeOrderByWithAggregationInput[]
    by: PrivilegeScalarFieldEnum[] | PrivilegeScalarFieldEnum
    having?: PrivilegeScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: PrivilegeCountAggregateInputType | true
    _avg?: PrivilegeAvgAggregateInputType
    _sum?: PrivilegeSumAggregateInputType
    _min?: PrivilegeMinAggregateInputType
    _max?: PrivilegeMaxAggregateInputType
  }

  export type PrivilegeGroupByOutputType = {
    id: number
    privilegeCode: string
    privilegeName: string
    objectId: number
    fieldValues: JsonValue | null
    status: number
    description: string | null
    isDelete: boolean
    createTime: Date
    updateTime: Date
    _count: PrivilegeCountAggregateOutputType | null
    _avg: PrivilegeAvgAggregateOutputType | null
    _sum: PrivilegeSumAggregateOutputType | null
    _min: PrivilegeMinAggregateOutputType | null
    _max: PrivilegeMaxAggregateOutputType | null
  }

  type GetPrivilegeGroupByPayload<T extends PrivilegeGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<PrivilegeGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof PrivilegeGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], PrivilegeGroupByOutputType[P]>
            : GetScalarType<T[P], PrivilegeGroupByOutputType[P]>
        }
      >
    >


  export type PrivilegeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    privilegeCode?: boolean
    privilegeName?: boolean
    objectId?: boolean
    fieldValues?: boolean
    status?: boolean
    description?: boolean
    isDelete?: boolean
    createTime?: boolean
    updateTime?: boolean
    roles?: boolean | Privilege$rolesArgs<ExtArgs>
    object?: boolean | AuthObjectDefaultArgs<ExtArgs>
    _count?: boolean | PrivilegeCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["privilege"]>



  export type PrivilegeSelectScalar = {
    id?: boolean
    privilegeCode?: boolean
    privilegeName?: boolean
    objectId?: boolean
    fieldValues?: boolean
    status?: boolean
    description?: boolean
    isDelete?: boolean
    createTime?: boolean
    updateTime?: boolean
  }

  export type PrivilegeOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "privilegeCode" | "privilegeName" | "objectId" | "fieldValues" | "status" | "description" | "isDelete" | "createTime" | "updateTime", ExtArgs["result"]["privilege"]>
  export type PrivilegeInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    roles?: boolean | Privilege$rolesArgs<ExtArgs>
    object?: boolean | AuthObjectDefaultArgs<ExtArgs>
    _count?: boolean | PrivilegeCountOutputTypeDefaultArgs<ExtArgs>
  }

  export type $PrivilegePayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Privilege"
    objects: {
      roles: Prisma.$RolePrivilegePayload<ExtArgs>[]
      object: Prisma.$AuthObjectPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: number
      privilegeCode: string
      privilegeName: string
      objectId: number
      fieldValues: Prisma.JsonValue | null
      status: number
      description: string | null
      isDelete: boolean
      createTime: Date
      updateTime: Date
    }, ExtArgs["result"]["privilege"]>
    composites: {}
  }

  type PrivilegeGetPayload<S extends boolean | null | undefined | PrivilegeDefaultArgs> = $Result.GetResult<Prisma.$PrivilegePayload, S>

  type PrivilegeCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<PrivilegeFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: PrivilegeCountAggregateInputType | true
    }

  export interface PrivilegeDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Privilege'], meta: { name: 'Privilege' } }
    /**
     * Find zero or one Privilege that matches the filter.
     * @param {PrivilegeFindUniqueArgs} args - Arguments to find a Privilege
     * @example
     * // Get one Privilege
     * const privilege = await prisma.privilege.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends PrivilegeFindUniqueArgs>(args: SelectSubset<T, PrivilegeFindUniqueArgs<ExtArgs>>): Prisma__PrivilegeClient<$Result.GetResult<Prisma.$PrivilegePayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Privilege that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {PrivilegeFindUniqueOrThrowArgs} args - Arguments to find a Privilege
     * @example
     * // Get one Privilege
     * const privilege = await prisma.privilege.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends PrivilegeFindUniqueOrThrowArgs>(args: SelectSubset<T, PrivilegeFindUniqueOrThrowArgs<ExtArgs>>): Prisma__PrivilegeClient<$Result.GetResult<Prisma.$PrivilegePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Privilege that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PrivilegeFindFirstArgs} args - Arguments to find a Privilege
     * @example
     * // Get one Privilege
     * const privilege = await prisma.privilege.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends PrivilegeFindFirstArgs>(args?: SelectSubset<T, PrivilegeFindFirstArgs<ExtArgs>>): Prisma__PrivilegeClient<$Result.GetResult<Prisma.$PrivilegePayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Privilege that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PrivilegeFindFirstOrThrowArgs} args - Arguments to find a Privilege
     * @example
     * // Get one Privilege
     * const privilege = await prisma.privilege.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends PrivilegeFindFirstOrThrowArgs>(args?: SelectSubset<T, PrivilegeFindFirstOrThrowArgs<ExtArgs>>): Prisma__PrivilegeClient<$Result.GetResult<Prisma.$PrivilegePayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Privileges that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PrivilegeFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Privileges
     * const privileges = await prisma.privilege.findMany()
     * 
     * // Get first 10 Privileges
     * const privileges = await prisma.privilege.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const privilegeWithIdOnly = await prisma.privilege.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends PrivilegeFindManyArgs>(args?: SelectSubset<T, PrivilegeFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$PrivilegePayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Privilege.
     * @param {PrivilegeCreateArgs} args - Arguments to create a Privilege.
     * @example
     * // Create one Privilege
     * const Privilege = await prisma.privilege.create({
     *   data: {
     *     // ... data to create a Privilege
     *   }
     * })
     * 
     */
    create<T extends PrivilegeCreateArgs>(args: SelectSubset<T, PrivilegeCreateArgs<ExtArgs>>): Prisma__PrivilegeClient<$Result.GetResult<Prisma.$PrivilegePayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Privileges.
     * @param {PrivilegeCreateManyArgs} args - Arguments to create many Privileges.
     * @example
     * // Create many Privileges
     * const privilege = await prisma.privilege.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends PrivilegeCreateManyArgs>(args?: SelectSubset<T, PrivilegeCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Delete a Privilege.
     * @param {PrivilegeDeleteArgs} args - Arguments to delete one Privilege.
     * @example
     * // Delete one Privilege
     * const Privilege = await prisma.privilege.delete({
     *   where: {
     *     // ... filter to delete one Privilege
     *   }
     * })
     * 
     */
    delete<T extends PrivilegeDeleteArgs>(args: SelectSubset<T, PrivilegeDeleteArgs<ExtArgs>>): Prisma__PrivilegeClient<$Result.GetResult<Prisma.$PrivilegePayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Privilege.
     * @param {PrivilegeUpdateArgs} args - Arguments to update one Privilege.
     * @example
     * // Update one Privilege
     * const privilege = await prisma.privilege.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends PrivilegeUpdateArgs>(args: SelectSubset<T, PrivilegeUpdateArgs<ExtArgs>>): Prisma__PrivilegeClient<$Result.GetResult<Prisma.$PrivilegePayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Privileges.
     * @param {PrivilegeDeleteManyArgs} args - Arguments to filter Privileges to delete.
     * @example
     * // Delete a few Privileges
     * const { count } = await prisma.privilege.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends PrivilegeDeleteManyArgs>(args?: SelectSubset<T, PrivilegeDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Privileges.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PrivilegeUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Privileges
     * const privilege = await prisma.privilege.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends PrivilegeUpdateManyArgs>(args: SelectSubset<T, PrivilegeUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one Privilege.
     * @param {PrivilegeUpsertArgs} args - Arguments to update or create a Privilege.
     * @example
     * // Update or create a Privilege
     * const privilege = await prisma.privilege.upsert({
     *   create: {
     *     // ... data to create a Privilege
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Privilege we want to update
     *   }
     * })
     */
    upsert<T extends PrivilegeUpsertArgs>(args: SelectSubset<T, PrivilegeUpsertArgs<ExtArgs>>): Prisma__PrivilegeClient<$Result.GetResult<Prisma.$PrivilegePayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Privileges.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PrivilegeCountArgs} args - Arguments to filter Privileges to count.
     * @example
     * // Count the number of Privileges
     * const count = await prisma.privilege.count({
     *   where: {
     *     // ... the filter for the Privileges we want to count
     *   }
     * })
    **/
    count<T extends PrivilegeCountArgs>(
      args?: Subset<T, PrivilegeCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], PrivilegeCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Privilege.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PrivilegeAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends PrivilegeAggregateArgs>(args: Subset<T, PrivilegeAggregateArgs>): Prisma.PrismaPromise<GetPrivilegeAggregateType<T>>

    /**
     * Group by Privilege.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PrivilegeGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends PrivilegeGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: PrivilegeGroupByArgs['orderBy'] }
        : { orderBy?: PrivilegeGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, PrivilegeGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetPrivilegeGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Privilege model
   */
  readonly fields: PrivilegeFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Privilege.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__PrivilegeClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    roles<T extends Privilege$rolesArgs<ExtArgs> = {}>(args?: Subset<T, Privilege$rolesArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$RolePrivilegePayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    object<T extends AuthObjectDefaultArgs<ExtArgs> = {}>(args?: Subset<T, AuthObjectDefaultArgs<ExtArgs>>): Prisma__AuthObjectClient<$Result.GetResult<Prisma.$AuthObjectPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Privilege model
   */
  interface PrivilegeFieldRefs {
    readonly id: FieldRef<"Privilege", 'Int'>
    readonly privilegeCode: FieldRef<"Privilege", 'String'>
    readonly privilegeName: FieldRef<"Privilege", 'String'>
    readonly objectId: FieldRef<"Privilege", 'Int'>
    readonly fieldValues: FieldRef<"Privilege", 'Json'>
    readonly status: FieldRef<"Privilege", 'Int'>
    readonly description: FieldRef<"Privilege", 'String'>
    readonly isDelete: FieldRef<"Privilege", 'Boolean'>
    readonly createTime: FieldRef<"Privilege", 'DateTime'>
    readonly updateTime: FieldRef<"Privilege", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Privilege findUnique
   */
  export type PrivilegeFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Privilege
     */
    select?: PrivilegeSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Privilege
     */
    omit?: PrivilegeOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PrivilegeInclude<ExtArgs> | null
    /**
     * Filter, which Privilege to fetch.
     */
    where: PrivilegeWhereUniqueInput
  }

  /**
   * Privilege findUniqueOrThrow
   */
  export type PrivilegeFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Privilege
     */
    select?: PrivilegeSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Privilege
     */
    omit?: PrivilegeOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PrivilegeInclude<ExtArgs> | null
    /**
     * Filter, which Privilege to fetch.
     */
    where: PrivilegeWhereUniqueInput
  }

  /**
   * Privilege findFirst
   */
  export type PrivilegeFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Privilege
     */
    select?: PrivilegeSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Privilege
     */
    omit?: PrivilegeOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PrivilegeInclude<ExtArgs> | null
    /**
     * Filter, which Privilege to fetch.
     */
    where?: PrivilegeWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Privileges to fetch.
     */
    orderBy?: PrivilegeOrderByWithRelationInput | PrivilegeOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Privileges.
     */
    cursor?: PrivilegeWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Privileges from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Privileges.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Privileges.
     */
    distinct?: PrivilegeScalarFieldEnum | PrivilegeScalarFieldEnum[]
  }

  /**
   * Privilege findFirstOrThrow
   */
  export type PrivilegeFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Privilege
     */
    select?: PrivilegeSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Privilege
     */
    omit?: PrivilegeOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PrivilegeInclude<ExtArgs> | null
    /**
     * Filter, which Privilege to fetch.
     */
    where?: PrivilegeWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Privileges to fetch.
     */
    orderBy?: PrivilegeOrderByWithRelationInput | PrivilegeOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Privileges.
     */
    cursor?: PrivilegeWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Privileges from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Privileges.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Privileges.
     */
    distinct?: PrivilegeScalarFieldEnum | PrivilegeScalarFieldEnum[]
  }

  /**
   * Privilege findMany
   */
  export type PrivilegeFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Privilege
     */
    select?: PrivilegeSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Privilege
     */
    omit?: PrivilegeOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PrivilegeInclude<ExtArgs> | null
    /**
     * Filter, which Privileges to fetch.
     */
    where?: PrivilegeWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Privileges to fetch.
     */
    orderBy?: PrivilegeOrderByWithRelationInput | PrivilegeOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Privileges.
     */
    cursor?: PrivilegeWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Privileges from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Privileges.
     */
    skip?: number
    distinct?: PrivilegeScalarFieldEnum | PrivilegeScalarFieldEnum[]
  }

  /**
   * Privilege create
   */
  export type PrivilegeCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Privilege
     */
    select?: PrivilegeSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Privilege
     */
    omit?: PrivilegeOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PrivilegeInclude<ExtArgs> | null
    /**
     * The data needed to create a Privilege.
     */
    data: XOR<PrivilegeCreateInput, PrivilegeUncheckedCreateInput>
  }

  /**
   * Privilege createMany
   */
  export type PrivilegeCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Privileges.
     */
    data: PrivilegeCreateManyInput | PrivilegeCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Privilege update
   */
  export type PrivilegeUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Privilege
     */
    select?: PrivilegeSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Privilege
     */
    omit?: PrivilegeOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PrivilegeInclude<ExtArgs> | null
    /**
     * The data needed to update a Privilege.
     */
    data: XOR<PrivilegeUpdateInput, PrivilegeUncheckedUpdateInput>
    /**
     * Choose, which Privilege to update.
     */
    where: PrivilegeWhereUniqueInput
  }

  /**
   * Privilege updateMany
   */
  export type PrivilegeUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Privileges.
     */
    data: XOR<PrivilegeUpdateManyMutationInput, PrivilegeUncheckedUpdateManyInput>
    /**
     * Filter which Privileges to update
     */
    where?: PrivilegeWhereInput
    /**
     * Limit how many Privileges to update.
     */
    limit?: number
  }

  /**
   * Privilege upsert
   */
  export type PrivilegeUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Privilege
     */
    select?: PrivilegeSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Privilege
     */
    omit?: PrivilegeOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PrivilegeInclude<ExtArgs> | null
    /**
     * The filter to search for the Privilege to update in case it exists.
     */
    where: PrivilegeWhereUniqueInput
    /**
     * In case the Privilege found by the `where` argument doesn't exist, create a new Privilege with this data.
     */
    create: XOR<PrivilegeCreateInput, PrivilegeUncheckedCreateInput>
    /**
     * In case the Privilege was found with the provided `where` argument, update it with this data.
     */
    update: XOR<PrivilegeUpdateInput, PrivilegeUncheckedUpdateInput>
  }

  /**
   * Privilege delete
   */
  export type PrivilegeDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Privilege
     */
    select?: PrivilegeSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Privilege
     */
    omit?: PrivilegeOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PrivilegeInclude<ExtArgs> | null
    /**
     * Filter which Privilege to delete.
     */
    where: PrivilegeWhereUniqueInput
  }

  /**
   * Privilege deleteMany
   */
  export type PrivilegeDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Privileges to delete
     */
    where?: PrivilegeWhereInput
    /**
     * Limit how many Privileges to delete.
     */
    limit?: number
  }

  /**
   * Privilege.roles
   */
  export type Privilege$rolesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RolePrivilege
     */
    select?: RolePrivilegeSelect<ExtArgs> | null
    /**
     * Omit specific fields from the RolePrivilege
     */
    omit?: RolePrivilegeOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RolePrivilegeInclude<ExtArgs> | null
    where?: RolePrivilegeWhereInput
    orderBy?: RolePrivilegeOrderByWithRelationInput | RolePrivilegeOrderByWithRelationInput[]
    cursor?: RolePrivilegeWhereUniqueInput
    take?: number
    skip?: number
    distinct?: RolePrivilegeScalarFieldEnum | RolePrivilegeScalarFieldEnum[]
  }

  /**
   * Privilege without action
   */
  export type PrivilegeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Privilege
     */
    select?: PrivilegeSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Privilege
     */
    omit?: PrivilegeOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PrivilegeInclude<ExtArgs> | null
  }


  /**
   * Model PrivilegeDelegation
   */

  export type AggregatePrivilegeDelegation = {
    _count: PrivilegeDelegationCountAggregateOutputType | null
    _avg: PrivilegeDelegationAvgAggregateOutputType | null
    _sum: PrivilegeDelegationSumAggregateOutputType | null
    _min: PrivilegeDelegationMinAggregateOutputType | null
    _max: PrivilegeDelegationMaxAggregateOutputType | null
  }

  export type PrivilegeDelegationAvgAggregateOutputType = {
    id: number | null
    delegatorUserId: number | null
    delegateeUserId: number | null
    status: number | null
  }

  export type PrivilegeDelegationSumAggregateOutputType = {
    id: number | null
    delegatorUserId: number | null
    delegateeUserId: number | null
    status: number | null
  }

  export type PrivilegeDelegationMinAggregateOutputType = {
    id: number | null
    delegatorUserId: number | null
    delegateeUserId: number | null
    startTime: Date | null
    endTime: Date | null
    status: number | null
    description: string | null
    isDelete: boolean | null
    createTime: Date | null
    updateTime: Date | null
  }

  export type PrivilegeDelegationMaxAggregateOutputType = {
    id: number | null
    delegatorUserId: number | null
    delegateeUserId: number | null
    startTime: Date | null
    endTime: Date | null
    status: number | null
    description: string | null
    isDelete: boolean | null
    createTime: Date | null
    updateTime: Date | null
  }

  export type PrivilegeDelegationCountAggregateOutputType = {
    id: number
    delegatorUserId: number
    delegateeUserId: number
    startTime: number
    endTime: number
    status: number
    description: number
    isDelete: number
    createTime: number
    updateTime: number
    _all: number
  }


  export type PrivilegeDelegationAvgAggregateInputType = {
    id?: true
    delegatorUserId?: true
    delegateeUserId?: true
    status?: true
  }

  export type PrivilegeDelegationSumAggregateInputType = {
    id?: true
    delegatorUserId?: true
    delegateeUserId?: true
    status?: true
  }

  export type PrivilegeDelegationMinAggregateInputType = {
    id?: true
    delegatorUserId?: true
    delegateeUserId?: true
    startTime?: true
    endTime?: true
    status?: true
    description?: true
    isDelete?: true
    createTime?: true
    updateTime?: true
  }

  export type PrivilegeDelegationMaxAggregateInputType = {
    id?: true
    delegatorUserId?: true
    delegateeUserId?: true
    startTime?: true
    endTime?: true
    status?: true
    description?: true
    isDelete?: true
    createTime?: true
    updateTime?: true
  }

  export type PrivilegeDelegationCountAggregateInputType = {
    id?: true
    delegatorUserId?: true
    delegateeUserId?: true
    startTime?: true
    endTime?: true
    status?: true
    description?: true
    isDelete?: true
    createTime?: true
    updateTime?: true
    _all?: true
  }

  export type PrivilegeDelegationAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which PrivilegeDelegation to aggregate.
     */
    where?: PrivilegeDelegationWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of PrivilegeDelegations to fetch.
     */
    orderBy?: PrivilegeDelegationOrderByWithRelationInput | PrivilegeDelegationOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: PrivilegeDelegationWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` PrivilegeDelegations from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` PrivilegeDelegations.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned PrivilegeDelegations
    **/
    _count?: true | PrivilegeDelegationCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: PrivilegeDelegationAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: PrivilegeDelegationSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: PrivilegeDelegationMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: PrivilegeDelegationMaxAggregateInputType
  }

  export type GetPrivilegeDelegationAggregateType<T extends PrivilegeDelegationAggregateArgs> = {
        [P in keyof T & keyof AggregatePrivilegeDelegation]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregatePrivilegeDelegation[P]>
      : GetScalarType<T[P], AggregatePrivilegeDelegation[P]>
  }




  export type PrivilegeDelegationGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: PrivilegeDelegationWhereInput
    orderBy?: PrivilegeDelegationOrderByWithAggregationInput | PrivilegeDelegationOrderByWithAggregationInput[]
    by: PrivilegeDelegationScalarFieldEnum[] | PrivilegeDelegationScalarFieldEnum
    having?: PrivilegeDelegationScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: PrivilegeDelegationCountAggregateInputType | true
    _avg?: PrivilegeDelegationAvgAggregateInputType
    _sum?: PrivilegeDelegationSumAggregateInputType
    _min?: PrivilegeDelegationMinAggregateInputType
    _max?: PrivilegeDelegationMaxAggregateInputType
  }

  export type PrivilegeDelegationGroupByOutputType = {
    id: number
    delegatorUserId: number
    delegateeUserId: number
    startTime: Date
    endTime: Date
    status: number
    description: string | null
    isDelete: boolean
    createTime: Date
    updateTime: Date
    _count: PrivilegeDelegationCountAggregateOutputType | null
    _avg: PrivilegeDelegationAvgAggregateOutputType | null
    _sum: PrivilegeDelegationSumAggregateOutputType | null
    _min: PrivilegeDelegationMinAggregateOutputType | null
    _max: PrivilegeDelegationMaxAggregateOutputType | null
  }

  type GetPrivilegeDelegationGroupByPayload<T extends PrivilegeDelegationGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<PrivilegeDelegationGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof PrivilegeDelegationGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], PrivilegeDelegationGroupByOutputType[P]>
            : GetScalarType<T[P], PrivilegeDelegationGroupByOutputType[P]>
        }
      >
    >


  export type PrivilegeDelegationSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    delegatorUserId?: boolean
    delegateeUserId?: boolean
    startTime?: boolean
    endTime?: boolean
    status?: boolean
    description?: boolean
    isDelete?: boolean
    createTime?: boolean
    updateTime?: boolean
    delegatorUser?: boolean | UserDefaultArgs<ExtArgs>
    delegateeUser?: boolean | UserDefaultArgs<ExtArgs>
    delegationDetails?: boolean | PrivilegeDelegation$delegationDetailsArgs<ExtArgs>
    _count?: boolean | PrivilegeDelegationCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["privilegeDelegation"]>



  export type PrivilegeDelegationSelectScalar = {
    id?: boolean
    delegatorUserId?: boolean
    delegateeUserId?: boolean
    startTime?: boolean
    endTime?: boolean
    status?: boolean
    description?: boolean
    isDelete?: boolean
    createTime?: boolean
    updateTime?: boolean
  }

  export type PrivilegeDelegationOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "delegatorUserId" | "delegateeUserId" | "startTime" | "endTime" | "status" | "description" | "isDelete" | "createTime" | "updateTime", ExtArgs["result"]["privilegeDelegation"]>
  export type PrivilegeDelegationInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    delegatorUser?: boolean | UserDefaultArgs<ExtArgs>
    delegateeUser?: boolean | UserDefaultArgs<ExtArgs>
    delegationDetails?: boolean | PrivilegeDelegation$delegationDetailsArgs<ExtArgs>
    _count?: boolean | PrivilegeDelegationCountOutputTypeDefaultArgs<ExtArgs>
  }

  export type $PrivilegeDelegationPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "PrivilegeDelegation"
    objects: {
      delegatorUser: Prisma.$UserPayload<ExtArgs>
      delegateeUser: Prisma.$UserPayload<ExtArgs>
      delegationDetails: Prisma.$DelegationDetailPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: number
      delegatorUserId: number
      delegateeUserId: number
      startTime: Date
      endTime: Date
      status: number
      description: string | null
      isDelete: boolean
      createTime: Date
      updateTime: Date
    }, ExtArgs["result"]["privilegeDelegation"]>
    composites: {}
  }

  type PrivilegeDelegationGetPayload<S extends boolean | null | undefined | PrivilegeDelegationDefaultArgs> = $Result.GetResult<Prisma.$PrivilegeDelegationPayload, S>

  type PrivilegeDelegationCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<PrivilegeDelegationFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: PrivilegeDelegationCountAggregateInputType | true
    }

  export interface PrivilegeDelegationDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['PrivilegeDelegation'], meta: { name: 'PrivilegeDelegation' } }
    /**
     * Find zero or one PrivilegeDelegation that matches the filter.
     * @param {PrivilegeDelegationFindUniqueArgs} args - Arguments to find a PrivilegeDelegation
     * @example
     * // Get one PrivilegeDelegation
     * const privilegeDelegation = await prisma.privilegeDelegation.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends PrivilegeDelegationFindUniqueArgs>(args: SelectSubset<T, PrivilegeDelegationFindUniqueArgs<ExtArgs>>): Prisma__PrivilegeDelegationClient<$Result.GetResult<Prisma.$PrivilegeDelegationPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one PrivilegeDelegation that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {PrivilegeDelegationFindUniqueOrThrowArgs} args - Arguments to find a PrivilegeDelegation
     * @example
     * // Get one PrivilegeDelegation
     * const privilegeDelegation = await prisma.privilegeDelegation.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends PrivilegeDelegationFindUniqueOrThrowArgs>(args: SelectSubset<T, PrivilegeDelegationFindUniqueOrThrowArgs<ExtArgs>>): Prisma__PrivilegeDelegationClient<$Result.GetResult<Prisma.$PrivilegeDelegationPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first PrivilegeDelegation that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PrivilegeDelegationFindFirstArgs} args - Arguments to find a PrivilegeDelegation
     * @example
     * // Get one PrivilegeDelegation
     * const privilegeDelegation = await prisma.privilegeDelegation.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends PrivilegeDelegationFindFirstArgs>(args?: SelectSubset<T, PrivilegeDelegationFindFirstArgs<ExtArgs>>): Prisma__PrivilegeDelegationClient<$Result.GetResult<Prisma.$PrivilegeDelegationPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first PrivilegeDelegation that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PrivilegeDelegationFindFirstOrThrowArgs} args - Arguments to find a PrivilegeDelegation
     * @example
     * // Get one PrivilegeDelegation
     * const privilegeDelegation = await prisma.privilegeDelegation.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends PrivilegeDelegationFindFirstOrThrowArgs>(args?: SelectSubset<T, PrivilegeDelegationFindFirstOrThrowArgs<ExtArgs>>): Prisma__PrivilegeDelegationClient<$Result.GetResult<Prisma.$PrivilegeDelegationPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more PrivilegeDelegations that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PrivilegeDelegationFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all PrivilegeDelegations
     * const privilegeDelegations = await prisma.privilegeDelegation.findMany()
     * 
     * // Get first 10 PrivilegeDelegations
     * const privilegeDelegations = await prisma.privilegeDelegation.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const privilegeDelegationWithIdOnly = await prisma.privilegeDelegation.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends PrivilegeDelegationFindManyArgs>(args?: SelectSubset<T, PrivilegeDelegationFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$PrivilegeDelegationPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a PrivilegeDelegation.
     * @param {PrivilegeDelegationCreateArgs} args - Arguments to create a PrivilegeDelegation.
     * @example
     * // Create one PrivilegeDelegation
     * const PrivilegeDelegation = await prisma.privilegeDelegation.create({
     *   data: {
     *     // ... data to create a PrivilegeDelegation
     *   }
     * })
     * 
     */
    create<T extends PrivilegeDelegationCreateArgs>(args: SelectSubset<T, PrivilegeDelegationCreateArgs<ExtArgs>>): Prisma__PrivilegeDelegationClient<$Result.GetResult<Prisma.$PrivilegeDelegationPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many PrivilegeDelegations.
     * @param {PrivilegeDelegationCreateManyArgs} args - Arguments to create many PrivilegeDelegations.
     * @example
     * // Create many PrivilegeDelegations
     * const privilegeDelegation = await prisma.privilegeDelegation.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends PrivilegeDelegationCreateManyArgs>(args?: SelectSubset<T, PrivilegeDelegationCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Delete a PrivilegeDelegation.
     * @param {PrivilegeDelegationDeleteArgs} args - Arguments to delete one PrivilegeDelegation.
     * @example
     * // Delete one PrivilegeDelegation
     * const PrivilegeDelegation = await prisma.privilegeDelegation.delete({
     *   where: {
     *     // ... filter to delete one PrivilegeDelegation
     *   }
     * })
     * 
     */
    delete<T extends PrivilegeDelegationDeleteArgs>(args: SelectSubset<T, PrivilegeDelegationDeleteArgs<ExtArgs>>): Prisma__PrivilegeDelegationClient<$Result.GetResult<Prisma.$PrivilegeDelegationPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one PrivilegeDelegation.
     * @param {PrivilegeDelegationUpdateArgs} args - Arguments to update one PrivilegeDelegation.
     * @example
     * // Update one PrivilegeDelegation
     * const privilegeDelegation = await prisma.privilegeDelegation.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends PrivilegeDelegationUpdateArgs>(args: SelectSubset<T, PrivilegeDelegationUpdateArgs<ExtArgs>>): Prisma__PrivilegeDelegationClient<$Result.GetResult<Prisma.$PrivilegeDelegationPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more PrivilegeDelegations.
     * @param {PrivilegeDelegationDeleteManyArgs} args - Arguments to filter PrivilegeDelegations to delete.
     * @example
     * // Delete a few PrivilegeDelegations
     * const { count } = await prisma.privilegeDelegation.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends PrivilegeDelegationDeleteManyArgs>(args?: SelectSubset<T, PrivilegeDelegationDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more PrivilegeDelegations.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PrivilegeDelegationUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many PrivilegeDelegations
     * const privilegeDelegation = await prisma.privilegeDelegation.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends PrivilegeDelegationUpdateManyArgs>(args: SelectSubset<T, PrivilegeDelegationUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one PrivilegeDelegation.
     * @param {PrivilegeDelegationUpsertArgs} args - Arguments to update or create a PrivilegeDelegation.
     * @example
     * // Update or create a PrivilegeDelegation
     * const privilegeDelegation = await prisma.privilegeDelegation.upsert({
     *   create: {
     *     // ... data to create a PrivilegeDelegation
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the PrivilegeDelegation we want to update
     *   }
     * })
     */
    upsert<T extends PrivilegeDelegationUpsertArgs>(args: SelectSubset<T, PrivilegeDelegationUpsertArgs<ExtArgs>>): Prisma__PrivilegeDelegationClient<$Result.GetResult<Prisma.$PrivilegeDelegationPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of PrivilegeDelegations.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PrivilegeDelegationCountArgs} args - Arguments to filter PrivilegeDelegations to count.
     * @example
     * // Count the number of PrivilegeDelegations
     * const count = await prisma.privilegeDelegation.count({
     *   where: {
     *     // ... the filter for the PrivilegeDelegations we want to count
     *   }
     * })
    **/
    count<T extends PrivilegeDelegationCountArgs>(
      args?: Subset<T, PrivilegeDelegationCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], PrivilegeDelegationCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a PrivilegeDelegation.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PrivilegeDelegationAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends PrivilegeDelegationAggregateArgs>(args: Subset<T, PrivilegeDelegationAggregateArgs>): Prisma.PrismaPromise<GetPrivilegeDelegationAggregateType<T>>

    /**
     * Group by PrivilegeDelegation.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {PrivilegeDelegationGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends PrivilegeDelegationGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: PrivilegeDelegationGroupByArgs['orderBy'] }
        : { orderBy?: PrivilegeDelegationGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, PrivilegeDelegationGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetPrivilegeDelegationGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the PrivilegeDelegation model
   */
  readonly fields: PrivilegeDelegationFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for PrivilegeDelegation.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__PrivilegeDelegationClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    delegatorUser<T extends UserDefaultArgs<ExtArgs> = {}>(args?: Subset<T, UserDefaultArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    delegateeUser<T extends UserDefaultArgs<ExtArgs> = {}>(args?: Subset<T, UserDefaultArgs<ExtArgs>>): Prisma__UserClient<$Result.GetResult<Prisma.$UserPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    delegationDetails<T extends PrivilegeDelegation$delegationDetailsArgs<ExtArgs> = {}>(args?: Subset<T, PrivilegeDelegation$delegationDetailsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$DelegationDetailPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the PrivilegeDelegation model
   */
  interface PrivilegeDelegationFieldRefs {
    readonly id: FieldRef<"PrivilegeDelegation", 'Int'>
    readonly delegatorUserId: FieldRef<"PrivilegeDelegation", 'Int'>
    readonly delegateeUserId: FieldRef<"PrivilegeDelegation", 'Int'>
    readonly startTime: FieldRef<"PrivilegeDelegation", 'DateTime'>
    readonly endTime: FieldRef<"PrivilegeDelegation", 'DateTime'>
    readonly status: FieldRef<"PrivilegeDelegation", 'Int'>
    readonly description: FieldRef<"PrivilegeDelegation", 'String'>
    readonly isDelete: FieldRef<"PrivilegeDelegation", 'Boolean'>
    readonly createTime: FieldRef<"PrivilegeDelegation", 'DateTime'>
    readonly updateTime: FieldRef<"PrivilegeDelegation", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * PrivilegeDelegation findUnique
   */
  export type PrivilegeDelegationFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PrivilegeDelegation
     */
    select?: PrivilegeDelegationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the PrivilegeDelegation
     */
    omit?: PrivilegeDelegationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PrivilegeDelegationInclude<ExtArgs> | null
    /**
     * Filter, which PrivilegeDelegation to fetch.
     */
    where: PrivilegeDelegationWhereUniqueInput
  }

  /**
   * PrivilegeDelegation findUniqueOrThrow
   */
  export type PrivilegeDelegationFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PrivilegeDelegation
     */
    select?: PrivilegeDelegationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the PrivilegeDelegation
     */
    omit?: PrivilegeDelegationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PrivilegeDelegationInclude<ExtArgs> | null
    /**
     * Filter, which PrivilegeDelegation to fetch.
     */
    where: PrivilegeDelegationWhereUniqueInput
  }

  /**
   * PrivilegeDelegation findFirst
   */
  export type PrivilegeDelegationFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PrivilegeDelegation
     */
    select?: PrivilegeDelegationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the PrivilegeDelegation
     */
    omit?: PrivilegeDelegationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PrivilegeDelegationInclude<ExtArgs> | null
    /**
     * Filter, which PrivilegeDelegation to fetch.
     */
    where?: PrivilegeDelegationWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of PrivilegeDelegations to fetch.
     */
    orderBy?: PrivilegeDelegationOrderByWithRelationInput | PrivilegeDelegationOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for PrivilegeDelegations.
     */
    cursor?: PrivilegeDelegationWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` PrivilegeDelegations from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` PrivilegeDelegations.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of PrivilegeDelegations.
     */
    distinct?: PrivilegeDelegationScalarFieldEnum | PrivilegeDelegationScalarFieldEnum[]
  }

  /**
   * PrivilegeDelegation findFirstOrThrow
   */
  export type PrivilegeDelegationFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PrivilegeDelegation
     */
    select?: PrivilegeDelegationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the PrivilegeDelegation
     */
    omit?: PrivilegeDelegationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PrivilegeDelegationInclude<ExtArgs> | null
    /**
     * Filter, which PrivilegeDelegation to fetch.
     */
    where?: PrivilegeDelegationWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of PrivilegeDelegations to fetch.
     */
    orderBy?: PrivilegeDelegationOrderByWithRelationInput | PrivilegeDelegationOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for PrivilegeDelegations.
     */
    cursor?: PrivilegeDelegationWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` PrivilegeDelegations from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` PrivilegeDelegations.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of PrivilegeDelegations.
     */
    distinct?: PrivilegeDelegationScalarFieldEnum | PrivilegeDelegationScalarFieldEnum[]
  }

  /**
   * PrivilegeDelegation findMany
   */
  export type PrivilegeDelegationFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PrivilegeDelegation
     */
    select?: PrivilegeDelegationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the PrivilegeDelegation
     */
    omit?: PrivilegeDelegationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PrivilegeDelegationInclude<ExtArgs> | null
    /**
     * Filter, which PrivilegeDelegations to fetch.
     */
    where?: PrivilegeDelegationWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of PrivilegeDelegations to fetch.
     */
    orderBy?: PrivilegeDelegationOrderByWithRelationInput | PrivilegeDelegationOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing PrivilegeDelegations.
     */
    cursor?: PrivilegeDelegationWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` PrivilegeDelegations from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` PrivilegeDelegations.
     */
    skip?: number
    distinct?: PrivilegeDelegationScalarFieldEnum | PrivilegeDelegationScalarFieldEnum[]
  }

  /**
   * PrivilegeDelegation create
   */
  export type PrivilegeDelegationCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PrivilegeDelegation
     */
    select?: PrivilegeDelegationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the PrivilegeDelegation
     */
    omit?: PrivilegeDelegationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PrivilegeDelegationInclude<ExtArgs> | null
    /**
     * The data needed to create a PrivilegeDelegation.
     */
    data: XOR<PrivilegeDelegationCreateInput, PrivilegeDelegationUncheckedCreateInput>
  }

  /**
   * PrivilegeDelegation createMany
   */
  export type PrivilegeDelegationCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many PrivilegeDelegations.
     */
    data: PrivilegeDelegationCreateManyInput | PrivilegeDelegationCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * PrivilegeDelegation update
   */
  export type PrivilegeDelegationUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PrivilegeDelegation
     */
    select?: PrivilegeDelegationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the PrivilegeDelegation
     */
    omit?: PrivilegeDelegationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PrivilegeDelegationInclude<ExtArgs> | null
    /**
     * The data needed to update a PrivilegeDelegation.
     */
    data: XOR<PrivilegeDelegationUpdateInput, PrivilegeDelegationUncheckedUpdateInput>
    /**
     * Choose, which PrivilegeDelegation to update.
     */
    where: PrivilegeDelegationWhereUniqueInput
  }

  /**
   * PrivilegeDelegation updateMany
   */
  export type PrivilegeDelegationUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update PrivilegeDelegations.
     */
    data: XOR<PrivilegeDelegationUpdateManyMutationInput, PrivilegeDelegationUncheckedUpdateManyInput>
    /**
     * Filter which PrivilegeDelegations to update
     */
    where?: PrivilegeDelegationWhereInput
    /**
     * Limit how many PrivilegeDelegations to update.
     */
    limit?: number
  }

  /**
   * PrivilegeDelegation upsert
   */
  export type PrivilegeDelegationUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PrivilegeDelegation
     */
    select?: PrivilegeDelegationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the PrivilegeDelegation
     */
    omit?: PrivilegeDelegationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PrivilegeDelegationInclude<ExtArgs> | null
    /**
     * The filter to search for the PrivilegeDelegation to update in case it exists.
     */
    where: PrivilegeDelegationWhereUniqueInput
    /**
     * In case the PrivilegeDelegation found by the `where` argument doesn't exist, create a new PrivilegeDelegation with this data.
     */
    create: XOR<PrivilegeDelegationCreateInput, PrivilegeDelegationUncheckedCreateInput>
    /**
     * In case the PrivilegeDelegation was found with the provided `where` argument, update it with this data.
     */
    update: XOR<PrivilegeDelegationUpdateInput, PrivilegeDelegationUncheckedUpdateInput>
  }

  /**
   * PrivilegeDelegation delete
   */
  export type PrivilegeDelegationDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PrivilegeDelegation
     */
    select?: PrivilegeDelegationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the PrivilegeDelegation
     */
    omit?: PrivilegeDelegationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PrivilegeDelegationInclude<ExtArgs> | null
    /**
     * Filter which PrivilegeDelegation to delete.
     */
    where: PrivilegeDelegationWhereUniqueInput
  }

  /**
   * PrivilegeDelegation deleteMany
   */
  export type PrivilegeDelegationDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which PrivilegeDelegations to delete
     */
    where?: PrivilegeDelegationWhereInput
    /**
     * Limit how many PrivilegeDelegations to delete.
     */
    limit?: number
  }

  /**
   * PrivilegeDelegation.delegationDetails
   */
  export type PrivilegeDelegation$delegationDetailsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DelegationDetail
     */
    select?: DelegationDetailSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DelegationDetail
     */
    omit?: DelegationDetailOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DelegationDetailInclude<ExtArgs> | null
    where?: DelegationDetailWhereInput
    orderBy?: DelegationDetailOrderByWithRelationInput | DelegationDetailOrderByWithRelationInput[]
    cursor?: DelegationDetailWhereUniqueInput
    take?: number
    skip?: number
    distinct?: DelegationDetailScalarFieldEnum | DelegationDetailScalarFieldEnum[]
  }

  /**
   * PrivilegeDelegation without action
   */
  export type PrivilegeDelegationDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the PrivilegeDelegation
     */
    select?: PrivilegeDelegationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the PrivilegeDelegation
     */
    omit?: PrivilegeDelegationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: PrivilegeDelegationInclude<ExtArgs> | null
  }


  /**
   * Model DelegationDetail
   */

  export type AggregateDelegationDetail = {
    _count: DelegationDetailCountAggregateOutputType | null
    _avg: DelegationDetailAvgAggregateOutputType | null
    _sum: DelegationDetailSumAggregateOutputType | null
    _min: DelegationDetailMinAggregateOutputType | null
    _max: DelegationDetailMaxAggregateOutputType | null
  }

  export type DelegationDetailAvgAggregateOutputType = {
    delegationId: number | null
  }

  export type DelegationDetailSumAggregateOutputType = {
    delegationId: number | null
  }

  export type DelegationDetailMinAggregateOutputType = {
    delegationId: number | null
    resourceCode: string | null
  }

  export type DelegationDetailMaxAggregateOutputType = {
    delegationId: number | null
    resourceCode: string | null
  }

  export type DelegationDetailCountAggregateOutputType = {
    delegationId: number
    resourceCode: number
    _all: number
  }


  export type DelegationDetailAvgAggregateInputType = {
    delegationId?: true
  }

  export type DelegationDetailSumAggregateInputType = {
    delegationId?: true
  }

  export type DelegationDetailMinAggregateInputType = {
    delegationId?: true
    resourceCode?: true
  }

  export type DelegationDetailMaxAggregateInputType = {
    delegationId?: true
    resourceCode?: true
  }

  export type DelegationDetailCountAggregateInputType = {
    delegationId?: true
    resourceCode?: true
    _all?: true
  }

  export type DelegationDetailAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which DelegationDetail to aggregate.
     */
    where?: DelegationDetailWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of DelegationDetails to fetch.
     */
    orderBy?: DelegationDetailOrderByWithRelationInput | DelegationDetailOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: DelegationDetailWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` DelegationDetails from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` DelegationDetails.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned DelegationDetails
    **/
    _count?: true | DelegationDetailCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: DelegationDetailAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: DelegationDetailSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: DelegationDetailMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: DelegationDetailMaxAggregateInputType
  }

  export type GetDelegationDetailAggregateType<T extends DelegationDetailAggregateArgs> = {
        [P in keyof T & keyof AggregateDelegationDetail]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateDelegationDetail[P]>
      : GetScalarType<T[P], AggregateDelegationDetail[P]>
  }




  export type DelegationDetailGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: DelegationDetailWhereInput
    orderBy?: DelegationDetailOrderByWithAggregationInput | DelegationDetailOrderByWithAggregationInput[]
    by: DelegationDetailScalarFieldEnum[] | DelegationDetailScalarFieldEnum
    having?: DelegationDetailScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: DelegationDetailCountAggregateInputType | true
    _avg?: DelegationDetailAvgAggregateInputType
    _sum?: DelegationDetailSumAggregateInputType
    _min?: DelegationDetailMinAggregateInputType
    _max?: DelegationDetailMaxAggregateInputType
  }

  export type DelegationDetailGroupByOutputType = {
    delegationId: number
    resourceCode: string
    _count: DelegationDetailCountAggregateOutputType | null
    _avg: DelegationDetailAvgAggregateOutputType | null
    _sum: DelegationDetailSumAggregateOutputType | null
    _min: DelegationDetailMinAggregateOutputType | null
    _max: DelegationDetailMaxAggregateOutputType | null
  }

  type GetDelegationDetailGroupByPayload<T extends DelegationDetailGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<DelegationDetailGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof DelegationDetailGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], DelegationDetailGroupByOutputType[P]>
            : GetScalarType<T[P], DelegationDetailGroupByOutputType[P]>
        }
      >
    >


  export type DelegationDetailSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    delegationId?: boolean
    resourceCode?: boolean
    delegation?: boolean | PrivilegeDelegationDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["delegationDetail"]>



  export type DelegationDetailSelectScalar = {
    delegationId?: boolean
    resourceCode?: boolean
  }

  export type DelegationDetailOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"delegationId" | "resourceCode", ExtArgs["result"]["delegationDetail"]>
  export type DelegationDetailInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    delegation?: boolean | PrivilegeDelegationDefaultArgs<ExtArgs>
  }

  export type $DelegationDetailPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "DelegationDetail"
    objects: {
      delegation: Prisma.$PrivilegeDelegationPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      delegationId: number
      resourceCode: string
    }, ExtArgs["result"]["delegationDetail"]>
    composites: {}
  }

  type DelegationDetailGetPayload<S extends boolean | null | undefined | DelegationDetailDefaultArgs> = $Result.GetResult<Prisma.$DelegationDetailPayload, S>

  type DelegationDetailCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<DelegationDetailFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: DelegationDetailCountAggregateInputType | true
    }

  export interface DelegationDetailDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['DelegationDetail'], meta: { name: 'DelegationDetail' } }
    /**
     * Find zero or one DelegationDetail that matches the filter.
     * @param {DelegationDetailFindUniqueArgs} args - Arguments to find a DelegationDetail
     * @example
     * // Get one DelegationDetail
     * const delegationDetail = await prisma.delegationDetail.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends DelegationDetailFindUniqueArgs>(args: SelectSubset<T, DelegationDetailFindUniqueArgs<ExtArgs>>): Prisma__DelegationDetailClient<$Result.GetResult<Prisma.$DelegationDetailPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one DelegationDetail that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {DelegationDetailFindUniqueOrThrowArgs} args - Arguments to find a DelegationDetail
     * @example
     * // Get one DelegationDetail
     * const delegationDetail = await prisma.delegationDetail.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends DelegationDetailFindUniqueOrThrowArgs>(args: SelectSubset<T, DelegationDetailFindUniqueOrThrowArgs<ExtArgs>>): Prisma__DelegationDetailClient<$Result.GetResult<Prisma.$DelegationDetailPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first DelegationDetail that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DelegationDetailFindFirstArgs} args - Arguments to find a DelegationDetail
     * @example
     * // Get one DelegationDetail
     * const delegationDetail = await prisma.delegationDetail.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends DelegationDetailFindFirstArgs>(args?: SelectSubset<T, DelegationDetailFindFirstArgs<ExtArgs>>): Prisma__DelegationDetailClient<$Result.GetResult<Prisma.$DelegationDetailPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first DelegationDetail that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DelegationDetailFindFirstOrThrowArgs} args - Arguments to find a DelegationDetail
     * @example
     * // Get one DelegationDetail
     * const delegationDetail = await prisma.delegationDetail.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends DelegationDetailFindFirstOrThrowArgs>(args?: SelectSubset<T, DelegationDetailFindFirstOrThrowArgs<ExtArgs>>): Prisma__DelegationDetailClient<$Result.GetResult<Prisma.$DelegationDetailPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more DelegationDetails that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DelegationDetailFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all DelegationDetails
     * const delegationDetails = await prisma.delegationDetail.findMany()
     * 
     * // Get first 10 DelegationDetails
     * const delegationDetails = await prisma.delegationDetail.findMany({ take: 10 })
     * 
     * // Only select the `delegationId`
     * const delegationDetailWithDelegationIdOnly = await prisma.delegationDetail.findMany({ select: { delegationId: true } })
     * 
     */
    findMany<T extends DelegationDetailFindManyArgs>(args?: SelectSubset<T, DelegationDetailFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$DelegationDetailPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a DelegationDetail.
     * @param {DelegationDetailCreateArgs} args - Arguments to create a DelegationDetail.
     * @example
     * // Create one DelegationDetail
     * const DelegationDetail = await prisma.delegationDetail.create({
     *   data: {
     *     // ... data to create a DelegationDetail
     *   }
     * })
     * 
     */
    create<T extends DelegationDetailCreateArgs>(args: SelectSubset<T, DelegationDetailCreateArgs<ExtArgs>>): Prisma__DelegationDetailClient<$Result.GetResult<Prisma.$DelegationDetailPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many DelegationDetails.
     * @param {DelegationDetailCreateManyArgs} args - Arguments to create many DelegationDetails.
     * @example
     * // Create many DelegationDetails
     * const delegationDetail = await prisma.delegationDetail.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends DelegationDetailCreateManyArgs>(args?: SelectSubset<T, DelegationDetailCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Delete a DelegationDetail.
     * @param {DelegationDetailDeleteArgs} args - Arguments to delete one DelegationDetail.
     * @example
     * // Delete one DelegationDetail
     * const DelegationDetail = await prisma.delegationDetail.delete({
     *   where: {
     *     // ... filter to delete one DelegationDetail
     *   }
     * })
     * 
     */
    delete<T extends DelegationDetailDeleteArgs>(args: SelectSubset<T, DelegationDetailDeleteArgs<ExtArgs>>): Prisma__DelegationDetailClient<$Result.GetResult<Prisma.$DelegationDetailPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one DelegationDetail.
     * @param {DelegationDetailUpdateArgs} args - Arguments to update one DelegationDetail.
     * @example
     * // Update one DelegationDetail
     * const delegationDetail = await prisma.delegationDetail.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends DelegationDetailUpdateArgs>(args: SelectSubset<T, DelegationDetailUpdateArgs<ExtArgs>>): Prisma__DelegationDetailClient<$Result.GetResult<Prisma.$DelegationDetailPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more DelegationDetails.
     * @param {DelegationDetailDeleteManyArgs} args - Arguments to filter DelegationDetails to delete.
     * @example
     * // Delete a few DelegationDetails
     * const { count } = await prisma.delegationDetail.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends DelegationDetailDeleteManyArgs>(args?: SelectSubset<T, DelegationDetailDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more DelegationDetails.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DelegationDetailUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many DelegationDetails
     * const delegationDetail = await prisma.delegationDetail.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends DelegationDetailUpdateManyArgs>(args: SelectSubset<T, DelegationDetailUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one DelegationDetail.
     * @param {DelegationDetailUpsertArgs} args - Arguments to update or create a DelegationDetail.
     * @example
     * // Update or create a DelegationDetail
     * const delegationDetail = await prisma.delegationDetail.upsert({
     *   create: {
     *     // ... data to create a DelegationDetail
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the DelegationDetail we want to update
     *   }
     * })
     */
    upsert<T extends DelegationDetailUpsertArgs>(args: SelectSubset<T, DelegationDetailUpsertArgs<ExtArgs>>): Prisma__DelegationDetailClient<$Result.GetResult<Prisma.$DelegationDetailPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of DelegationDetails.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DelegationDetailCountArgs} args - Arguments to filter DelegationDetails to count.
     * @example
     * // Count the number of DelegationDetails
     * const count = await prisma.delegationDetail.count({
     *   where: {
     *     // ... the filter for the DelegationDetails we want to count
     *   }
     * })
    **/
    count<T extends DelegationDetailCountArgs>(
      args?: Subset<T, DelegationDetailCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], DelegationDetailCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a DelegationDetail.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DelegationDetailAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends DelegationDetailAggregateArgs>(args: Subset<T, DelegationDetailAggregateArgs>): Prisma.PrismaPromise<GetDelegationDetailAggregateType<T>>

    /**
     * Group by DelegationDetail.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DelegationDetailGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends DelegationDetailGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: DelegationDetailGroupByArgs['orderBy'] }
        : { orderBy?: DelegationDetailGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, DelegationDetailGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetDelegationDetailGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the DelegationDetail model
   */
  readonly fields: DelegationDetailFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for DelegationDetail.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__DelegationDetailClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    delegation<T extends PrivilegeDelegationDefaultArgs<ExtArgs> = {}>(args?: Subset<T, PrivilegeDelegationDefaultArgs<ExtArgs>>): Prisma__PrivilegeDelegationClient<$Result.GetResult<Prisma.$PrivilegeDelegationPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the DelegationDetail model
   */
  interface DelegationDetailFieldRefs {
    readonly delegationId: FieldRef<"DelegationDetail", 'Int'>
    readonly resourceCode: FieldRef<"DelegationDetail", 'String'>
  }
    

  // Custom InputTypes
  /**
   * DelegationDetail findUnique
   */
  export type DelegationDetailFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DelegationDetail
     */
    select?: DelegationDetailSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DelegationDetail
     */
    omit?: DelegationDetailOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DelegationDetailInclude<ExtArgs> | null
    /**
     * Filter, which DelegationDetail to fetch.
     */
    where: DelegationDetailWhereUniqueInput
  }

  /**
   * DelegationDetail findUniqueOrThrow
   */
  export type DelegationDetailFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DelegationDetail
     */
    select?: DelegationDetailSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DelegationDetail
     */
    omit?: DelegationDetailOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DelegationDetailInclude<ExtArgs> | null
    /**
     * Filter, which DelegationDetail to fetch.
     */
    where: DelegationDetailWhereUniqueInput
  }

  /**
   * DelegationDetail findFirst
   */
  export type DelegationDetailFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DelegationDetail
     */
    select?: DelegationDetailSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DelegationDetail
     */
    omit?: DelegationDetailOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DelegationDetailInclude<ExtArgs> | null
    /**
     * Filter, which DelegationDetail to fetch.
     */
    where?: DelegationDetailWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of DelegationDetails to fetch.
     */
    orderBy?: DelegationDetailOrderByWithRelationInput | DelegationDetailOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for DelegationDetails.
     */
    cursor?: DelegationDetailWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` DelegationDetails from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` DelegationDetails.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of DelegationDetails.
     */
    distinct?: DelegationDetailScalarFieldEnum | DelegationDetailScalarFieldEnum[]
  }

  /**
   * DelegationDetail findFirstOrThrow
   */
  export type DelegationDetailFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DelegationDetail
     */
    select?: DelegationDetailSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DelegationDetail
     */
    omit?: DelegationDetailOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DelegationDetailInclude<ExtArgs> | null
    /**
     * Filter, which DelegationDetail to fetch.
     */
    where?: DelegationDetailWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of DelegationDetails to fetch.
     */
    orderBy?: DelegationDetailOrderByWithRelationInput | DelegationDetailOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for DelegationDetails.
     */
    cursor?: DelegationDetailWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` DelegationDetails from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` DelegationDetails.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of DelegationDetails.
     */
    distinct?: DelegationDetailScalarFieldEnum | DelegationDetailScalarFieldEnum[]
  }

  /**
   * DelegationDetail findMany
   */
  export type DelegationDetailFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DelegationDetail
     */
    select?: DelegationDetailSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DelegationDetail
     */
    omit?: DelegationDetailOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DelegationDetailInclude<ExtArgs> | null
    /**
     * Filter, which DelegationDetails to fetch.
     */
    where?: DelegationDetailWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of DelegationDetails to fetch.
     */
    orderBy?: DelegationDetailOrderByWithRelationInput | DelegationDetailOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing DelegationDetails.
     */
    cursor?: DelegationDetailWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` DelegationDetails from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` DelegationDetails.
     */
    skip?: number
    distinct?: DelegationDetailScalarFieldEnum | DelegationDetailScalarFieldEnum[]
  }

  /**
   * DelegationDetail create
   */
  export type DelegationDetailCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DelegationDetail
     */
    select?: DelegationDetailSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DelegationDetail
     */
    omit?: DelegationDetailOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DelegationDetailInclude<ExtArgs> | null
    /**
     * The data needed to create a DelegationDetail.
     */
    data: XOR<DelegationDetailCreateInput, DelegationDetailUncheckedCreateInput>
  }

  /**
   * DelegationDetail createMany
   */
  export type DelegationDetailCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many DelegationDetails.
     */
    data: DelegationDetailCreateManyInput | DelegationDetailCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * DelegationDetail update
   */
  export type DelegationDetailUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DelegationDetail
     */
    select?: DelegationDetailSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DelegationDetail
     */
    omit?: DelegationDetailOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DelegationDetailInclude<ExtArgs> | null
    /**
     * The data needed to update a DelegationDetail.
     */
    data: XOR<DelegationDetailUpdateInput, DelegationDetailUncheckedUpdateInput>
    /**
     * Choose, which DelegationDetail to update.
     */
    where: DelegationDetailWhereUniqueInput
  }

  /**
   * DelegationDetail updateMany
   */
  export type DelegationDetailUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update DelegationDetails.
     */
    data: XOR<DelegationDetailUpdateManyMutationInput, DelegationDetailUncheckedUpdateManyInput>
    /**
     * Filter which DelegationDetails to update
     */
    where?: DelegationDetailWhereInput
    /**
     * Limit how many DelegationDetails to update.
     */
    limit?: number
  }

  /**
   * DelegationDetail upsert
   */
  export type DelegationDetailUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DelegationDetail
     */
    select?: DelegationDetailSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DelegationDetail
     */
    omit?: DelegationDetailOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DelegationDetailInclude<ExtArgs> | null
    /**
     * The filter to search for the DelegationDetail to update in case it exists.
     */
    where: DelegationDetailWhereUniqueInput
    /**
     * In case the DelegationDetail found by the `where` argument doesn't exist, create a new DelegationDetail with this data.
     */
    create: XOR<DelegationDetailCreateInput, DelegationDetailUncheckedCreateInput>
    /**
     * In case the DelegationDetail was found with the provided `where` argument, update it with this data.
     */
    update: XOR<DelegationDetailUpdateInput, DelegationDetailUncheckedUpdateInput>
  }

  /**
   * DelegationDetail delete
   */
  export type DelegationDetailDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DelegationDetail
     */
    select?: DelegationDetailSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DelegationDetail
     */
    omit?: DelegationDetailOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DelegationDetailInclude<ExtArgs> | null
    /**
     * Filter which DelegationDetail to delete.
     */
    where: DelegationDetailWhereUniqueInput
  }

  /**
   * DelegationDetail deleteMany
   */
  export type DelegationDetailDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which DelegationDetails to delete
     */
    where?: DelegationDetailWhereInput
    /**
     * Limit how many DelegationDetails to delete.
     */
    limit?: number
  }

  /**
   * DelegationDetail without action
   */
  export type DelegationDetailDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the DelegationDetail
     */
    select?: DelegationDetailSelect<ExtArgs> | null
    /**
     * Omit specific fields from the DelegationDetail
     */
    omit?: DelegationDetailOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DelegationDetailInclude<ExtArgs> | null
  }


  /**
   * Model RolePrivilege
   */

  export type AggregateRolePrivilege = {
    _count: RolePrivilegeCountAggregateOutputType | null
    _avg: RolePrivilegeAvgAggregateOutputType | null
    _sum: RolePrivilegeSumAggregateOutputType | null
    _min: RolePrivilegeMinAggregateOutputType | null
    _max: RolePrivilegeMaxAggregateOutputType | null
  }

  export type RolePrivilegeAvgAggregateOutputType = {
    roleId: number | null
    privilegeId: number | null
  }

  export type RolePrivilegeSumAggregateOutputType = {
    roleId: number | null
    privilegeId: number | null
  }

  export type RolePrivilegeMinAggregateOutputType = {
    roleId: number | null
    privilegeId: number | null
  }

  export type RolePrivilegeMaxAggregateOutputType = {
    roleId: number | null
    privilegeId: number | null
  }

  export type RolePrivilegeCountAggregateOutputType = {
    roleId: number
    privilegeId: number
    _all: number
  }


  export type RolePrivilegeAvgAggregateInputType = {
    roleId?: true
    privilegeId?: true
  }

  export type RolePrivilegeSumAggregateInputType = {
    roleId?: true
    privilegeId?: true
  }

  export type RolePrivilegeMinAggregateInputType = {
    roleId?: true
    privilegeId?: true
  }

  export type RolePrivilegeMaxAggregateInputType = {
    roleId?: true
    privilegeId?: true
  }

  export type RolePrivilegeCountAggregateInputType = {
    roleId?: true
    privilegeId?: true
    _all?: true
  }

  export type RolePrivilegeAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which RolePrivilege to aggregate.
     */
    where?: RolePrivilegeWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of RolePrivileges to fetch.
     */
    orderBy?: RolePrivilegeOrderByWithRelationInput | RolePrivilegeOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: RolePrivilegeWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` RolePrivileges from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` RolePrivileges.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned RolePrivileges
    **/
    _count?: true | RolePrivilegeCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: RolePrivilegeAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: RolePrivilegeSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: RolePrivilegeMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: RolePrivilegeMaxAggregateInputType
  }

  export type GetRolePrivilegeAggregateType<T extends RolePrivilegeAggregateArgs> = {
        [P in keyof T & keyof AggregateRolePrivilege]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateRolePrivilege[P]>
      : GetScalarType<T[P], AggregateRolePrivilege[P]>
  }




  export type RolePrivilegeGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: RolePrivilegeWhereInput
    orderBy?: RolePrivilegeOrderByWithAggregationInput | RolePrivilegeOrderByWithAggregationInput[]
    by: RolePrivilegeScalarFieldEnum[] | RolePrivilegeScalarFieldEnum
    having?: RolePrivilegeScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: RolePrivilegeCountAggregateInputType | true
    _avg?: RolePrivilegeAvgAggregateInputType
    _sum?: RolePrivilegeSumAggregateInputType
    _min?: RolePrivilegeMinAggregateInputType
    _max?: RolePrivilegeMaxAggregateInputType
  }

  export type RolePrivilegeGroupByOutputType = {
    roleId: number
    privilegeId: number
    _count: RolePrivilegeCountAggregateOutputType | null
    _avg: RolePrivilegeAvgAggregateOutputType | null
    _sum: RolePrivilegeSumAggregateOutputType | null
    _min: RolePrivilegeMinAggregateOutputType | null
    _max: RolePrivilegeMaxAggregateOutputType | null
  }

  type GetRolePrivilegeGroupByPayload<T extends RolePrivilegeGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<RolePrivilegeGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof RolePrivilegeGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], RolePrivilegeGroupByOutputType[P]>
            : GetScalarType<T[P], RolePrivilegeGroupByOutputType[P]>
        }
      >
    >


  export type RolePrivilegeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    roleId?: boolean
    privilegeId?: boolean
    role?: boolean | RoleDefaultArgs<ExtArgs>
    privilege?: boolean | PrivilegeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["rolePrivilege"]>



  export type RolePrivilegeSelectScalar = {
    roleId?: boolean
    privilegeId?: boolean
  }

  export type RolePrivilegeOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"roleId" | "privilegeId", ExtArgs["result"]["rolePrivilege"]>
  export type RolePrivilegeInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    role?: boolean | RoleDefaultArgs<ExtArgs>
    privilege?: boolean | PrivilegeDefaultArgs<ExtArgs>
  }

  export type $RolePrivilegePayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "RolePrivilege"
    objects: {
      role: Prisma.$RolePayload<ExtArgs>
      privilege: Prisma.$PrivilegePayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      roleId: number
      privilegeId: number
    }, ExtArgs["result"]["rolePrivilege"]>
    composites: {}
  }

  type RolePrivilegeGetPayload<S extends boolean | null | undefined | RolePrivilegeDefaultArgs> = $Result.GetResult<Prisma.$RolePrivilegePayload, S>

  type RolePrivilegeCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<RolePrivilegeFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: RolePrivilegeCountAggregateInputType | true
    }

  export interface RolePrivilegeDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['RolePrivilege'], meta: { name: 'RolePrivilege' } }
    /**
     * Find zero or one RolePrivilege that matches the filter.
     * @param {RolePrivilegeFindUniqueArgs} args - Arguments to find a RolePrivilege
     * @example
     * // Get one RolePrivilege
     * const rolePrivilege = await prisma.rolePrivilege.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends RolePrivilegeFindUniqueArgs>(args: SelectSubset<T, RolePrivilegeFindUniqueArgs<ExtArgs>>): Prisma__RolePrivilegeClient<$Result.GetResult<Prisma.$RolePrivilegePayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one RolePrivilege that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {RolePrivilegeFindUniqueOrThrowArgs} args - Arguments to find a RolePrivilege
     * @example
     * // Get one RolePrivilege
     * const rolePrivilege = await prisma.rolePrivilege.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends RolePrivilegeFindUniqueOrThrowArgs>(args: SelectSubset<T, RolePrivilegeFindUniqueOrThrowArgs<ExtArgs>>): Prisma__RolePrivilegeClient<$Result.GetResult<Prisma.$RolePrivilegePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first RolePrivilege that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RolePrivilegeFindFirstArgs} args - Arguments to find a RolePrivilege
     * @example
     * // Get one RolePrivilege
     * const rolePrivilege = await prisma.rolePrivilege.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends RolePrivilegeFindFirstArgs>(args?: SelectSubset<T, RolePrivilegeFindFirstArgs<ExtArgs>>): Prisma__RolePrivilegeClient<$Result.GetResult<Prisma.$RolePrivilegePayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first RolePrivilege that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RolePrivilegeFindFirstOrThrowArgs} args - Arguments to find a RolePrivilege
     * @example
     * // Get one RolePrivilege
     * const rolePrivilege = await prisma.rolePrivilege.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends RolePrivilegeFindFirstOrThrowArgs>(args?: SelectSubset<T, RolePrivilegeFindFirstOrThrowArgs<ExtArgs>>): Prisma__RolePrivilegeClient<$Result.GetResult<Prisma.$RolePrivilegePayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more RolePrivileges that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RolePrivilegeFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all RolePrivileges
     * const rolePrivileges = await prisma.rolePrivilege.findMany()
     * 
     * // Get first 10 RolePrivileges
     * const rolePrivileges = await prisma.rolePrivilege.findMany({ take: 10 })
     * 
     * // Only select the `roleId`
     * const rolePrivilegeWithRoleIdOnly = await prisma.rolePrivilege.findMany({ select: { roleId: true } })
     * 
     */
    findMany<T extends RolePrivilegeFindManyArgs>(args?: SelectSubset<T, RolePrivilegeFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$RolePrivilegePayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a RolePrivilege.
     * @param {RolePrivilegeCreateArgs} args - Arguments to create a RolePrivilege.
     * @example
     * // Create one RolePrivilege
     * const RolePrivilege = await prisma.rolePrivilege.create({
     *   data: {
     *     // ... data to create a RolePrivilege
     *   }
     * })
     * 
     */
    create<T extends RolePrivilegeCreateArgs>(args: SelectSubset<T, RolePrivilegeCreateArgs<ExtArgs>>): Prisma__RolePrivilegeClient<$Result.GetResult<Prisma.$RolePrivilegePayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many RolePrivileges.
     * @param {RolePrivilegeCreateManyArgs} args - Arguments to create many RolePrivileges.
     * @example
     * // Create many RolePrivileges
     * const rolePrivilege = await prisma.rolePrivilege.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends RolePrivilegeCreateManyArgs>(args?: SelectSubset<T, RolePrivilegeCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Delete a RolePrivilege.
     * @param {RolePrivilegeDeleteArgs} args - Arguments to delete one RolePrivilege.
     * @example
     * // Delete one RolePrivilege
     * const RolePrivilege = await prisma.rolePrivilege.delete({
     *   where: {
     *     // ... filter to delete one RolePrivilege
     *   }
     * })
     * 
     */
    delete<T extends RolePrivilegeDeleteArgs>(args: SelectSubset<T, RolePrivilegeDeleteArgs<ExtArgs>>): Prisma__RolePrivilegeClient<$Result.GetResult<Prisma.$RolePrivilegePayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one RolePrivilege.
     * @param {RolePrivilegeUpdateArgs} args - Arguments to update one RolePrivilege.
     * @example
     * // Update one RolePrivilege
     * const rolePrivilege = await prisma.rolePrivilege.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends RolePrivilegeUpdateArgs>(args: SelectSubset<T, RolePrivilegeUpdateArgs<ExtArgs>>): Prisma__RolePrivilegeClient<$Result.GetResult<Prisma.$RolePrivilegePayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more RolePrivileges.
     * @param {RolePrivilegeDeleteManyArgs} args - Arguments to filter RolePrivileges to delete.
     * @example
     * // Delete a few RolePrivileges
     * const { count } = await prisma.rolePrivilege.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends RolePrivilegeDeleteManyArgs>(args?: SelectSubset<T, RolePrivilegeDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more RolePrivileges.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RolePrivilegeUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many RolePrivileges
     * const rolePrivilege = await prisma.rolePrivilege.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends RolePrivilegeUpdateManyArgs>(args: SelectSubset<T, RolePrivilegeUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one RolePrivilege.
     * @param {RolePrivilegeUpsertArgs} args - Arguments to update or create a RolePrivilege.
     * @example
     * // Update or create a RolePrivilege
     * const rolePrivilege = await prisma.rolePrivilege.upsert({
     *   create: {
     *     // ... data to create a RolePrivilege
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the RolePrivilege we want to update
     *   }
     * })
     */
    upsert<T extends RolePrivilegeUpsertArgs>(args: SelectSubset<T, RolePrivilegeUpsertArgs<ExtArgs>>): Prisma__RolePrivilegeClient<$Result.GetResult<Prisma.$RolePrivilegePayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of RolePrivileges.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RolePrivilegeCountArgs} args - Arguments to filter RolePrivileges to count.
     * @example
     * // Count the number of RolePrivileges
     * const count = await prisma.rolePrivilege.count({
     *   where: {
     *     // ... the filter for the RolePrivileges we want to count
     *   }
     * })
    **/
    count<T extends RolePrivilegeCountArgs>(
      args?: Subset<T, RolePrivilegeCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], RolePrivilegeCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a RolePrivilege.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RolePrivilegeAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends RolePrivilegeAggregateArgs>(args: Subset<T, RolePrivilegeAggregateArgs>): Prisma.PrismaPromise<GetRolePrivilegeAggregateType<T>>

    /**
     * Group by RolePrivilege.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RolePrivilegeGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends RolePrivilegeGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: RolePrivilegeGroupByArgs['orderBy'] }
        : { orderBy?: RolePrivilegeGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, RolePrivilegeGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetRolePrivilegeGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the RolePrivilege model
   */
  readonly fields: RolePrivilegeFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for RolePrivilege.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__RolePrivilegeClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    role<T extends RoleDefaultArgs<ExtArgs> = {}>(args?: Subset<T, RoleDefaultArgs<ExtArgs>>): Prisma__RoleClient<$Result.GetResult<Prisma.$RolePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    privilege<T extends PrivilegeDefaultArgs<ExtArgs> = {}>(args?: Subset<T, PrivilegeDefaultArgs<ExtArgs>>): Prisma__PrivilegeClient<$Result.GetResult<Prisma.$PrivilegePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the RolePrivilege model
   */
  interface RolePrivilegeFieldRefs {
    readonly roleId: FieldRef<"RolePrivilege", 'Int'>
    readonly privilegeId: FieldRef<"RolePrivilege", 'Int'>
  }
    

  // Custom InputTypes
  /**
   * RolePrivilege findUnique
   */
  export type RolePrivilegeFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RolePrivilege
     */
    select?: RolePrivilegeSelect<ExtArgs> | null
    /**
     * Omit specific fields from the RolePrivilege
     */
    omit?: RolePrivilegeOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RolePrivilegeInclude<ExtArgs> | null
    /**
     * Filter, which RolePrivilege to fetch.
     */
    where: RolePrivilegeWhereUniqueInput
  }

  /**
   * RolePrivilege findUniqueOrThrow
   */
  export type RolePrivilegeFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RolePrivilege
     */
    select?: RolePrivilegeSelect<ExtArgs> | null
    /**
     * Omit specific fields from the RolePrivilege
     */
    omit?: RolePrivilegeOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RolePrivilegeInclude<ExtArgs> | null
    /**
     * Filter, which RolePrivilege to fetch.
     */
    where: RolePrivilegeWhereUniqueInput
  }

  /**
   * RolePrivilege findFirst
   */
  export type RolePrivilegeFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RolePrivilege
     */
    select?: RolePrivilegeSelect<ExtArgs> | null
    /**
     * Omit specific fields from the RolePrivilege
     */
    omit?: RolePrivilegeOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RolePrivilegeInclude<ExtArgs> | null
    /**
     * Filter, which RolePrivilege to fetch.
     */
    where?: RolePrivilegeWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of RolePrivileges to fetch.
     */
    orderBy?: RolePrivilegeOrderByWithRelationInput | RolePrivilegeOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for RolePrivileges.
     */
    cursor?: RolePrivilegeWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` RolePrivileges from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` RolePrivileges.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of RolePrivileges.
     */
    distinct?: RolePrivilegeScalarFieldEnum | RolePrivilegeScalarFieldEnum[]
  }

  /**
   * RolePrivilege findFirstOrThrow
   */
  export type RolePrivilegeFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RolePrivilege
     */
    select?: RolePrivilegeSelect<ExtArgs> | null
    /**
     * Omit specific fields from the RolePrivilege
     */
    omit?: RolePrivilegeOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RolePrivilegeInclude<ExtArgs> | null
    /**
     * Filter, which RolePrivilege to fetch.
     */
    where?: RolePrivilegeWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of RolePrivileges to fetch.
     */
    orderBy?: RolePrivilegeOrderByWithRelationInput | RolePrivilegeOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for RolePrivileges.
     */
    cursor?: RolePrivilegeWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` RolePrivileges from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` RolePrivileges.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of RolePrivileges.
     */
    distinct?: RolePrivilegeScalarFieldEnum | RolePrivilegeScalarFieldEnum[]
  }

  /**
   * RolePrivilege findMany
   */
  export type RolePrivilegeFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RolePrivilege
     */
    select?: RolePrivilegeSelect<ExtArgs> | null
    /**
     * Omit specific fields from the RolePrivilege
     */
    omit?: RolePrivilegeOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RolePrivilegeInclude<ExtArgs> | null
    /**
     * Filter, which RolePrivileges to fetch.
     */
    where?: RolePrivilegeWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of RolePrivileges to fetch.
     */
    orderBy?: RolePrivilegeOrderByWithRelationInput | RolePrivilegeOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing RolePrivileges.
     */
    cursor?: RolePrivilegeWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` RolePrivileges from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` RolePrivileges.
     */
    skip?: number
    distinct?: RolePrivilegeScalarFieldEnum | RolePrivilegeScalarFieldEnum[]
  }

  /**
   * RolePrivilege create
   */
  export type RolePrivilegeCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RolePrivilege
     */
    select?: RolePrivilegeSelect<ExtArgs> | null
    /**
     * Omit specific fields from the RolePrivilege
     */
    omit?: RolePrivilegeOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RolePrivilegeInclude<ExtArgs> | null
    /**
     * The data needed to create a RolePrivilege.
     */
    data: XOR<RolePrivilegeCreateInput, RolePrivilegeUncheckedCreateInput>
  }

  /**
   * RolePrivilege createMany
   */
  export type RolePrivilegeCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many RolePrivileges.
     */
    data: RolePrivilegeCreateManyInput | RolePrivilegeCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * RolePrivilege update
   */
  export type RolePrivilegeUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RolePrivilege
     */
    select?: RolePrivilegeSelect<ExtArgs> | null
    /**
     * Omit specific fields from the RolePrivilege
     */
    omit?: RolePrivilegeOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RolePrivilegeInclude<ExtArgs> | null
    /**
     * The data needed to update a RolePrivilege.
     */
    data: XOR<RolePrivilegeUpdateInput, RolePrivilegeUncheckedUpdateInput>
    /**
     * Choose, which RolePrivilege to update.
     */
    where: RolePrivilegeWhereUniqueInput
  }

  /**
   * RolePrivilege updateMany
   */
  export type RolePrivilegeUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update RolePrivileges.
     */
    data: XOR<RolePrivilegeUpdateManyMutationInput, RolePrivilegeUncheckedUpdateManyInput>
    /**
     * Filter which RolePrivileges to update
     */
    where?: RolePrivilegeWhereInput
    /**
     * Limit how many RolePrivileges to update.
     */
    limit?: number
  }

  /**
   * RolePrivilege upsert
   */
  export type RolePrivilegeUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RolePrivilege
     */
    select?: RolePrivilegeSelect<ExtArgs> | null
    /**
     * Omit specific fields from the RolePrivilege
     */
    omit?: RolePrivilegeOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RolePrivilegeInclude<ExtArgs> | null
    /**
     * The filter to search for the RolePrivilege to update in case it exists.
     */
    where: RolePrivilegeWhereUniqueInput
    /**
     * In case the RolePrivilege found by the `where` argument doesn't exist, create a new RolePrivilege with this data.
     */
    create: XOR<RolePrivilegeCreateInput, RolePrivilegeUncheckedCreateInput>
    /**
     * In case the RolePrivilege was found with the provided `where` argument, update it with this data.
     */
    update: XOR<RolePrivilegeUpdateInput, RolePrivilegeUncheckedUpdateInput>
  }

  /**
   * RolePrivilege delete
   */
  export type RolePrivilegeDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RolePrivilege
     */
    select?: RolePrivilegeSelect<ExtArgs> | null
    /**
     * Omit specific fields from the RolePrivilege
     */
    omit?: RolePrivilegeOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RolePrivilegeInclude<ExtArgs> | null
    /**
     * Filter which RolePrivilege to delete.
     */
    where: RolePrivilegeWhereUniqueInput
  }

  /**
   * RolePrivilege deleteMany
   */
  export type RolePrivilegeDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which RolePrivileges to delete
     */
    where?: RolePrivilegeWhereInput
    /**
     * Limit how many RolePrivileges to delete.
     */
    limit?: number
  }

  /**
   * RolePrivilege without action
   */
  export type RolePrivilegeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RolePrivilege
     */
    select?: RolePrivilegeSelect<ExtArgs> | null
    /**
     * Omit specific fields from the RolePrivilege
     */
    omit?: RolePrivilegeOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RolePrivilegeInclude<ExtArgs> | null
  }


  /**
   * Enums
   */

  export const TransactionIsolationLevel: {
    ReadUncommitted: 'ReadUncommitted',
    ReadCommitted: 'ReadCommitted',
    RepeatableRead: 'RepeatableRead',
    Serializable: 'Serializable'
  };

  export type TransactionIsolationLevel = (typeof TransactionIsolationLevel)[keyof typeof TransactionIsolationLevel]


  export const UserScalarFieldEnum: {
    id: 'id',
    username: 'username',
    name: 'name',
    password: 'password',
    mobilePhone: 'mobilePhone',
    userType: 'userType',
    status: 'status',
    isDelete: 'isDelete',
    createTime: 'createTime',
    updateTime: 'updateTime'
  };

  export type UserScalarFieldEnum = (typeof UserScalarFieldEnum)[keyof typeof UserScalarFieldEnum]


  export const OrganizationScalarFieldEnum: {
    id: 'id',
    orgCode: 'orgCode',
    orgName: 'orgName',
    parentId: 'parentId',
    businessParentId: 'businessParentId',
    level: 'level',
    orgType: 'orgType',
    orderNum: 'orderNum',
    isVirtual: 'isVirtual',
    isEntity: 'isEntity',
    status: 'status',
    isDelete: 'isDelete',
    createTime: 'createTime',
    updateTime: 'updateTime'
  };

  export type OrganizationScalarFieldEnum = (typeof OrganizationScalarFieldEnum)[keyof typeof OrganizationScalarFieldEnum]


  export const PositionScalarFieldEnum: {
    id: 'id',
    posCode: 'posCode',
    posName: 'posName',
    status: 'status',
    description: 'description',
    isDelete: 'isDelete',
    createTime: 'createTime',
    updateTime: 'updateTime'
  };

  export type PositionScalarFieldEnum = (typeof PositionScalarFieldEnum)[keyof typeof PositionScalarFieldEnum]


  export const EmploymentScalarFieldEnum: {
    id: 'id',
    userId: 'userId',
    posId: 'posId',
    deptId: 'deptId',
    compId: 'compId',
    status: 'status',
    description: 'description',
    isDelete: 'isDelete',
    createTime: 'createTime',
    updateTime: 'updateTime'
  };

  export type EmploymentScalarFieldEnum = (typeof EmploymentScalarFieldEnum)[keyof typeof EmploymentScalarFieldEnum]


  export const ClientScalarFieldEnum: {
    id: 'id',
    clientCode: 'clientCode',
    clientName: 'clientName',
    status: 'status',
    description: 'description',
    isDelete: 'isDelete',
    createTime: 'createTime',
    updateTime: 'updateTime'
  };

  export type ClientScalarFieldEnum = (typeof ClientScalarFieldEnum)[keyof typeof ClientScalarFieldEnum]


  export const RoleScalarFieldEnum: {
    id: 'id',
    roleCode: 'roleCode',
    roleName: 'roleName',
    clientId: 'clientId',
    status: 'status',
    description: 'description',
    isDelete: 'isDelete',
    createTime: 'createTime',
    updateTime: 'updateTime'
  };

  export type RoleScalarFieldEnum = (typeof RoleScalarFieldEnum)[keyof typeof RoleScalarFieldEnum]


  export const PositionRoleScalarFieldEnum: {
    positionId: 'positionId',
    roleId: 'roleId'
  };

  export type PositionRoleScalarFieldEnum = (typeof PositionRoleScalarFieldEnum)[keyof typeof PositionRoleScalarFieldEnum]


  export const EmploymentRoleScalarFieldEnum: {
    employmentId: 'employmentId',
    roleId: 'roleId'
  };

  export type EmploymentRoleScalarFieldEnum = (typeof EmploymentRoleScalarFieldEnum)[keyof typeof EmploymentRoleScalarFieldEnum]


  export const OrganizationRoleScalarFieldEnum: {
    organizationId: 'organizationId',
    roleId: 'roleId'
  };

  export type OrganizationRoleScalarFieldEnum = (typeof OrganizationRoleScalarFieldEnum)[keyof typeof OrganizationRoleScalarFieldEnum]


  export const AuthObjectScalarFieldEnum: {
    id: 'id',
    objectCode: 'objectCode',
    objectName: 'objectName',
    objectType: 'objectType',
    path: 'path',
    authFields: 'authFields'
  };

  export type AuthObjectScalarFieldEnum = (typeof AuthObjectScalarFieldEnum)[keyof typeof AuthObjectScalarFieldEnum]


  export const PrivilegeScalarFieldEnum: {
    id: 'id',
    privilegeCode: 'privilegeCode',
    privilegeName: 'privilegeName',
    objectId: 'objectId',
    fieldValues: 'fieldValues',
    status: 'status',
    description: 'description',
    isDelete: 'isDelete',
    createTime: 'createTime',
    updateTime: 'updateTime'
  };

  export type PrivilegeScalarFieldEnum = (typeof PrivilegeScalarFieldEnum)[keyof typeof PrivilegeScalarFieldEnum]


  export const PrivilegeDelegationScalarFieldEnum: {
    id: 'id',
    delegatorUserId: 'delegatorUserId',
    delegateeUserId: 'delegateeUserId',
    startTime: 'startTime',
    endTime: 'endTime',
    status: 'status',
    description: 'description',
    isDelete: 'isDelete',
    createTime: 'createTime',
    updateTime: 'updateTime'
  };

  export type PrivilegeDelegationScalarFieldEnum = (typeof PrivilegeDelegationScalarFieldEnum)[keyof typeof PrivilegeDelegationScalarFieldEnum]


  export const DelegationDetailScalarFieldEnum: {
    delegationId: 'delegationId',
    resourceCode: 'resourceCode'
  };

  export type DelegationDetailScalarFieldEnum = (typeof DelegationDetailScalarFieldEnum)[keyof typeof DelegationDetailScalarFieldEnum]


  export const RolePrivilegeScalarFieldEnum: {
    roleId: 'roleId',
    privilegeId: 'privilegeId'
  };

  export type RolePrivilegeScalarFieldEnum = (typeof RolePrivilegeScalarFieldEnum)[keyof typeof RolePrivilegeScalarFieldEnum]


  export const SortOrder: {
    asc: 'asc',
    desc: 'desc'
  };

  export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder]


  export const NullableJsonNullValueInput: {
    DbNull: typeof DbNull,
    JsonNull: typeof JsonNull
  };

  export type NullableJsonNullValueInput = (typeof NullableJsonNullValueInput)[keyof typeof NullableJsonNullValueInput]


  export const NullsOrder: {
    first: 'first',
    last: 'last'
  };

  export type NullsOrder = (typeof NullsOrder)[keyof typeof NullsOrder]


  export const UserOrderByRelevanceFieldEnum: {
    username: 'username',
    name: 'name',
    password: 'password',
    mobilePhone: 'mobilePhone',
    userType: 'userType'
  };

  export type UserOrderByRelevanceFieldEnum = (typeof UserOrderByRelevanceFieldEnum)[keyof typeof UserOrderByRelevanceFieldEnum]


  export const OrganizationOrderByRelevanceFieldEnum: {
    orgCode: 'orgCode',
    orgName: 'orgName',
    orgType: 'orgType'
  };

  export type OrganizationOrderByRelevanceFieldEnum = (typeof OrganizationOrderByRelevanceFieldEnum)[keyof typeof OrganizationOrderByRelevanceFieldEnum]


  export const PositionOrderByRelevanceFieldEnum: {
    posCode: 'posCode',
    posName: 'posName',
    description: 'description'
  };

  export type PositionOrderByRelevanceFieldEnum = (typeof PositionOrderByRelevanceFieldEnum)[keyof typeof PositionOrderByRelevanceFieldEnum]


  export const EmploymentOrderByRelevanceFieldEnum: {
    description: 'description'
  };

  export type EmploymentOrderByRelevanceFieldEnum = (typeof EmploymentOrderByRelevanceFieldEnum)[keyof typeof EmploymentOrderByRelevanceFieldEnum]


  export const ClientOrderByRelevanceFieldEnum: {
    clientCode: 'clientCode',
    clientName: 'clientName',
    description: 'description'
  };

  export type ClientOrderByRelevanceFieldEnum = (typeof ClientOrderByRelevanceFieldEnum)[keyof typeof ClientOrderByRelevanceFieldEnum]


  export const RoleOrderByRelevanceFieldEnum: {
    roleCode: 'roleCode',
    roleName: 'roleName',
    description: 'description'
  };

  export type RoleOrderByRelevanceFieldEnum = (typeof RoleOrderByRelevanceFieldEnum)[keyof typeof RoleOrderByRelevanceFieldEnum]


  export const JsonNullValueFilter: {
    DbNull: typeof DbNull,
    JsonNull: typeof JsonNull,
    AnyNull: typeof AnyNull
  };

  export type JsonNullValueFilter = (typeof JsonNullValueFilter)[keyof typeof JsonNullValueFilter]


  export const QueryMode: {
    default: 'default',
    insensitive: 'insensitive'
  };

  export type QueryMode = (typeof QueryMode)[keyof typeof QueryMode]


  export const AuthObjectOrderByRelevanceFieldEnum: {
    objectCode: 'objectCode',
    objectName: 'objectName',
    objectType: 'objectType',
    path: 'path'
  };

  export type AuthObjectOrderByRelevanceFieldEnum = (typeof AuthObjectOrderByRelevanceFieldEnum)[keyof typeof AuthObjectOrderByRelevanceFieldEnum]


  export const PrivilegeOrderByRelevanceFieldEnum: {
    privilegeCode: 'privilegeCode',
    privilegeName: 'privilegeName',
    description: 'description'
  };

  export type PrivilegeOrderByRelevanceFieldEnum = (typeof PrivilegeOrderByRelevanceFieldEnum)[keyof typeof PrivilegeOrderByRelevanceFieldEnum]


  export const PrivilegeDelegationOrderByRelevanceFieldEnum: {
    description: 'description'
  };

  export type PrivilegeDelegationOrderByRelevanceFieldEnum = (typeof PrivilegeDelegationOrderByRelevanceFieldEnum)[keyof typeof PrivilegeDelegationOrderByRelevanceFieldEnum]


  export const DelegationDetailOrderByRelevanceFieldEnum: {
    resourceCode: 'resourceCode'
  };

  export type DelegationDetailOrderByRelevanceFieldEnum = (typeof DelegationDetailOrderByRelevanceFieldEnum)[keyof typeof DelegationDetailOrderByRelevanceFieldEnum]


  /**
   * Field references
   */


  /**
   * Reference to a field of type 'Int'
   */
  export type IntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int'>
    


  /**
   * Reference to a field of type 'String'
   */
  export type StringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String'>
    


  /**
   * Reference to a field of type 'Boolean'
   */
  export type BooleanFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Boolean'>
    


  /**
   * Reference to a field of type 'DateTime'
   */
  export type DateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime'>
    


  /**
   * Reference to a field of type 'Json'
   */
  export type JsonFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Json'>
    


  /**
   * Reference to a field of type 'QueryMode'
   */
  export type EnumQueryModeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'QueryMode'>
    


  /**
   * Reference to a field of type 'Float'
   */
  export type FloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float'>
    
  /**
   * Deep Input Types
   */


  export type UserWhereInput = {
    AND?: UserWhereInput | UserWhereInput[]
    OR?: UserWhereInput[]
    NOT?: UserWhereInput | UserWhereInput[]
    id?: IntFilter<"User"> | number
    username?: StringFilter<"User"> | string
    name?: StringFilter<"User"> | string
    password?: StringNullableFilter<"User"> | string | null
    mobilePhone?: StringNullableFilter<"User"> | string | null
    userType?: StringNullableFilter<"User"> | string | null
    status?: IntFilter<"User"> | number
    isDelete?: BoolFilter<"User"> | boolean
    createTime?: DateTimeFilter<"User"> | Date | string
    updateTime?: DateTimeFilter<"User"> | Date | string
    employments?: EmploymentListRelationFilter
    delegationTo?: PrivilegeDelegationListRelationFilter
    delegationFrom?: PrivilegeDelegationListRelationFilter
  }

  export type UserOrderByWithRelationInput = {
    id?: SortOrder
    username?: SortOrder
    name?: SortOrder
    password?: SortOrderInput | SortOrder
    mobilePhone?: SortOrderInput | SortOrder
    userType?: SortOrderInput | SortOrder
    status?: SortOrder
    isDelete?: SortOrder
    createTime?: SortOrder
    updateTime?: SortOrder
    employments?: EmploymentOrderByRelationAggregateInput
    delegationTo?: PrivilegeDelegationOrderByRelationAggregateInput
    delegationFrom?: PrivilegeDelegationOrderByRelationAggregateInput
    _relevance?: UserOrderByRelevanceInput
  }

  export type UserWhereUniqueInput = Prisma.AtLeast<{
    id?: number
    AND?: UserWhereInput | UserWhereInput[]
    OR?: UserWhereInput[]
    NOT?: UserWhereInput | UserWhereInput[]
    username?: StringFilter<"User"> | string
    name?: StringFilter<"User"> | string
    password?: StringNullableFilter<"User"> | string | null
    mobilePhone?: StringNullableFilter<"User"> | string | null
    userType?: StringNullableFilter<"User"> | string | null
    status?: IntFilter<"User"> | number
    isDelete?: BoolFilter<"User"> | boolean
    createTime?: DateTimeFilter<"User"> | Date | string
    updateTime?: DateTimeFilter<"User"> | Date | string
    employments?: EmploymentListRelationFilter
    delegationTo?: PrivilegeDelegationListRelationFilter
    delegationFrom?: PrivilegeDelegationListRelationFilter
  }, "id">

  export type UserOrderByWithAggregationInput = {
    id?: SortOrder
    username?: SortOrder
    name?: SortOrder
    password?: SortOrderInput | SortOrder
    mobilePhone?: SortOrderInput | SortOrder
    userType?: SortOrderInput | SortOrder
    status?: SortOrder
    isDelete?: SortOrder
    createTime?: SortOrder
    updateTime?: SortOrder
    _count?: UserCountOrderByAggregateInput
    _avg?: UserAvgOrderByAggregateInput
    _max?: UserMaxOrderByAggregateInput
    _min?: UserMinOrderByAggregateInput
    _sum?: UserSumOrderByAggregateInput
  }

  export type UserScalarWhereWithAggregatesInput = {
    AND?: UserScalarWhereWithAggregatesInput | UserScalarWhereWithAggregatesInput[]
    OR?: UserScalarWhereWithAggregatesInput[]
    NOT?: UserScalarWhereWithAggregatesInput | UserScalarWhereWithAggregatesInput[]
    id?: IntWithAggregatesFilter<"User"> | number
    username?: StringWithAggregatesFilter<"User"> | string
    name?: StringWithAggregatesFilter<"User"> | string
    password?: StringNullableWithAggregatesFilter<"User"> | string | null
    mobilePhone?: StringNullableWithAggregatesFilter<"User"> | string | null
    userType?: StringNullableWithAggregatesFilter<"User"> | string | null
    status?: IntWithAggregatesFilter<"User"> | number
    isDelete?: BoolWithAggregatesFilter<"User"> | boolean
    createTime?: DateTimeWithAggregatesFilter<"User"> | Date | string
    updateTime?: DateTimeWithAggregatesFilter<"User"> | Date | string
  }

  export type OrganizationWhereInput = {
    AND?: OrganizationWhereInput | OrganizationWhereInput[]
    OR?: OrganizationWhereInput[]
    NOT?: OrganizationWhereInput | OrganizationWhereInput[]
    id?: IntFilter<"Organization"> | number
    orgCode?: StringFilter<"Organization"> | string
    orgName?: StringFilter<"Organization"> | string
    parentId?: IntFilter<"Organization"> | number
    businessParentId?: IntFilter<"Organization"> | number
    level?: IntFilter<"Organization"> | number
    orgType?: StringFilter<"Organization"> | string
    orderNum?: IntFilter<"Organization"> | number
    isVirtual?: BoolFilter<"Organization"> | boolean
    isEntity?: BoolFilter<"Organization"> | boolean
    status?: BoolFilter<"Organization"> | boolean
    isDelete?: BoolFilter<"Organization"> | boolean
    createTime?: DateTimeFilter<"Organization"> | Date | string
    updateTime?: DateTimeFilter<"Organization"> | Date | string
    deptEmployments?: EmploymentListRelationFilter
    compEmployments?: EmploymentListRelationFilter
    roles?: OrganizationRoleListRelationFilter
  }

  export type OrganizationOrderByWithRelationInput = {
    id?: SortOrder
    orgCode?: SortOrder
    orgName?: SortOrder
    parentId?: SortOrder
    businessParentId?: SortOrder
    level?: SortOrder
    orgType?: SortOrder
    orderNum?: SortOrder
    isVirtual?: SortOrder
    isEntity?: SortOrder
    status?: SortOrder
    isDelete?: SortOrder
    createTime?: SortOrder
    updateTime?: SortOrder
    deptEmployments?: EmploymentOrderByRelationAggregateInput
    compEmployments?: EmploymentOrderByRelationAggregateInput
    roles?: OrganizationRoleOrderByRelationAggregateInput
    _relevance?: OrganizationOrderByRelevanceInput
  }

  export type OrganizationWhereUniqueInput = Prisma.AtLeast<{
    id?: number
    AND?: OrganizationWhereInput | OrganizationWhereInput[]
    OR?: OrganizationWhereInput[]
    NOT?: OrganizationWhereInput | OrganizationWhereInput[]
    orgCode?: StringFilter<"Organization"> | string
    orgName?: StringFilter<"Organization"> | string
    parentId?: IntFilter<"Organization"> | number
    businessParentId?: IntFilter<"Organization"> | number
    level?: IntFilter<"Organization"> | number
    orgType?: StringFilter<"Organization"> | string
    orderNum?: IntFilter<"Organization"> | number
    isVirtual?: BoolFilter<"Organization"> | boolean
    isEntity?: BoolFilter<"Organization"> | boolean
    status?: BoolFilter<"Organization"> | boolean
    isDelete?: BoolFilter<"Organization"> | boolean
    createTime?: DateTimeFilter<"Organization"> | Date | string
    updateTime?: DateTimeFilter<"Organization"> | Date | string
    deptEmployments?: EmploymentListRelationFilter
    compEmployments?: EmploymentListRelationFilter
    roles?: OrganizationRoleListRelationFilter
  }, "id">

  export type OrganizationOrderByWithAggregationInput = {
    id?: SortOrder
    orgCode?: SortOrder
    orgName?: SortOrder
    parentId?: SortOrder
    businessParentId?: SortOrder
    level?: SortOrder
    orgType?: SortOrder
    orderNum?: SortOrder
    isVirtual?: SortOrder
    isEntity?: SortOrder
    status?: SortOrder
    isDelete?: SortOrder
    createTime?: SortOrder
    updateTime?: SortOrder
    _count?: OrganizationCountOrderByAggregateInput
    _avg?: OrganizationAvgOrderByAggregateInput
    _max?: OrganizationMaxOrderByAggregateInput
    _min?: OrganizationMinOrderByAggregateInput
    _sum?: OrganizationSumOrderByAggregateInput
  }

  export type OrganizationScalarWhereWithAggregatesInput = {
    AND?: OrganizationScalarWhereWithAggregatesInput | OrganizationScalarWhereWithAggregatesInput[]
    OR?: OrganizationScalarWhereWithAggregatesInput[]
    NOT?: OrganizationScalarWhereWithAggregatesInput | OrganizationScalarWhereWithAggregatesInput[]
    id?: IntWithAggregatesFilter<"Organization"> | number
    orgCode?: StringWithAggregatesFilter<"Organization"> | string
    orgName?: StringWithAggregatesFilter<"Organization"> | string
    parentId?: IntWithAggregatesFilter<"Organization"> | number
    businessParentId?: IntWithAggregatesFilter<"Organization"> | number
    level?: IntWithAggregatesFilter<"Organization"> | number
    orgType?: StringWithAggregatesFilter<"Organization"> | string
    orderNum?: IntWithAggregatesFilter<"Organization"> | number
    isVirtual?: BoolWithAggregatesFilter<"Organization"> | boolean
    isEntity?: BoolWithAggregatesFilter<"Organization"> | boolean
    status?: BoolWithAggregatesFilter<"Organization"> | boolean
    isDelete?: BoolWithAggregatesFilter<"Organization"> | boolean
    createTime?: DateTimeWithAggregatesFilter<"Organization"> | Date | string
    updateTime?: DateTimeWithAggregatesFilter<"Organization"> | Date | string
  }

  export type PositionWhereInput = {
    AND?: PositionWhereInput | PositionWhereInput[]
    OR?: PositionWhereInput[]
    NOT?: PositionWhereInput | PositionWhereInput[]
    id?: IntFilter<"Position"> | number
    posCode?: StringFilter<"Position"> | string
    posName?: StringFilter<"Position"> | string
    status?: IntFilter<"Position"> | number
    description?: StringNullableFilter<"Position"> | string | null
    isDelete?: BoolFilter<"Position"> | boolean
    createTime?: DateTimeFilter<"Position"> | Date | string
    updateTime?: DateTimeFilter<"Position"> | Date | string
    employments?: EmploymentListRelationFilter
    roles?: PositionRoleListRelationFilter
  }

  export type PositionOrderByWithRelationInput = {
    id?: SortOrder
    posCode?: SortOrder
    posName?: SortOrder
    status?: SortOrder
    description?: SortOrderInput | SortOrder
    isDelete?: SortOrder
    createTime?: SortOrder
    updateTime?: SortOrder
    employments?: EmploymentOrderByRelationAggregateInput
    roles?: PositionRoleOrderByRelationAggregateInput
    _relevance?: PositionOrderByRelevanceInput
  }

  export type PositionWhereUniqueInput = Prisma.AtLeast<{
    id?: number
    AND?: PositionWhereInput | PositionWhereInput[]
    OR?: PositionWhereInput[]
    NOT?: PositionWhereInput | PositionWhereInput[]
    posCode?: StringFilter<"Position"> | string
    posName?: StringFilter<"Position"> | string
    status?: IntFilter<"Position"> | number
    description?: StringNullableFilter<"Position"> | string | null
    isDelete?: BoolFilter<"Position"> | boolean
    createTime?: DateTimeFilter<"Position"> | Date | string
    updateTime?: DateTimeFilter<"Position"> | Date | string
    employments?: EmploymentListRelationFilter
    roles?: PositionRoleListRelationFilter
  }, "id">

  export type PositionOrderByWithAggregationInput = {
    id?: SortOrder
    posCode?: SortOrder
    posName?: SortOrder
    status?: SortOrder
    description?: SortOrderInput | SortOrder
    isDelete?: SortOrder
    createTime?: SortOrder
    updateTime?: SortOrder
    _count?: PositionCountOrderByAggregateInput
    _avg?: PositionAvgOrderByAggregateInput
    _max?: PositionMaxOrderByAggregateInput
    _min?: PositionMinOrderByAggregateInput
    _sum?: PositionSumOrderByAggregateInput
  }

  export type PositionScalarWhereWithAggregatesInput = {
    AND?: PositionScalarWhereWithAggregatesInput | PositionScalarWhereWithAggregatesInput[]
    OR?: PositionScalarWhereWithAggregatesInput[]
    NOT?: PositionScalarWhereWithAggregatesInput | PositionScalarWhereWithAggregatesInput[]
    id?: IntWithAggregatesFilter<"Position"> | number
    posCode?: StringWithAggregatesFilter<"Position"> | string
    posName?: StringWithAggregatesFilter<"Position"> | string
    status?: IntWithAggregatesFilter<"Position"> | number
    description?: StringNullableWithAggregatesFilter<"Position"> | string | null
    isDelete?: BoolWithAggregatesFilter<"Position"> | boolean
    createTime?: DateTimeWithAggregatesFilter<"Position"> | Date | string
    updateTime?: DateTimeWithAggregatesFilter<"Position"> | Date | string
  }

  export type EmploymentWhereInput = {
    AND?: EmploymentWhereInput | EmploymentWhereInput[]
    OR?: EmploymentWhereInput[]
    NOT?: EmploymentWhereInput | EmploymentWhereInput[]
    id?: IntFilter<"Employment"> | number
    userId?: IntFilter<"Employment"> | number
    posId?: IntFilter<"Employment"> | number
    deptId?: IntFilter<"Employment"> | number
    compId?: IntFilter<"Employment"> | number
    status?: IntFilter<"Employment"> | number
    description?: StringNullableFilter<"Employment"> | string | null
    isDelete?: BoolFilter<"Employment"> | boolean
    createTime?: DateTimeFilter<"Employment"> | Date | string
    updateTime?: DateTimeFilter<"Employment"> | Date | string
    user?: XOR<UserScalarRelationFilter, UserWhereInput>
    deptartment?: XOR<OrganizationScalarRelationFilter, OrganizationWhereInput>
    company?: XOR<OrganizationScalarRelationFilter, OrganizationWhereInput>
    position?: XOR<PositionScalarRelationFilter, PositionWhereInput>
    roles?: EmploymentRoleListRelationFilter
  }

  export type EmploymentOrderByWithRelationInput = {
    id?: SortOrder
    userId?: SortOrder
    posId?: SortOrder
    deptId?: SortOrder
    compId?: SortOrder
    status?: SortOrder
    description?: SortOrderInput | SortOrder
    isDelete?: SortOrder
    createTime?: SortOrder
    updateTime?: SortOrder
    user?: UserOrderByWithRelationInput
    deptartment?: OrganizationOrderByWithRelationInput
    company?: OrganizationOrderByWithRelationInput
    position?: PositionOrderByWithRelationInput
    roles?: EmploymentRoleOrderByRelationAggregateInput
    _relevance?: EmploymentOrderByRelevanceInput
  }

  export type EmploymentWhereUniqueInput = Prisma.AtLeast<{
    id?: number
    AND?: EmploymentWhereInput | EmploymentWhereInput[]
    OR?: EmploymentWhereInput[]
    NOT?: EmploymentWhereInput | EmploymentWhereInput[]
    userId?: IntFilter<"Employment"> | number
    posId?: IntFilter<"Employment"> | number
    deptId?: IntFilter<"Employment"> | number
    compId?: IntFilter<"Employment"> | number
    status?: IntFilter<"Employment"> | number
    description?: StringNullableFilter<"Employment"> | string | null
    isDelete?: BoolFilter<"Employment"> | boolean
    createTime?: DateTimeFilter<"Employment"> | Date | string
    updateTime?: DateTimeFilter<"Employment"> | Date | string
    user?: XOR<UserScalarRelationFilter, UserWhereInput>
    deptartment?: XOR<OrganizationScalarRelationFilter, OrganizationWhereInput>
    company?: XOR<OrganizationScalarRelationFilter, OrganizationWhereInput>
    position?: XOR<PositionScalarRelationFilter, PositionWhereInput>
    roles?: EmploymentRoleListRelationFilter
  }, "id">

  export type EmploymentOrderByWithAggregationInput = {
    id?: SortOrder
    userId?: SortOrder
    posId?: SortOrder
    deptId?: SortOrder
    compId?: SortOrder
    status?: SortOrder
    description?: SortOrderInput | SortOrder
    isDelete?: SortOrder
    createTime?: SortOrder
    updateTime?: SortOrder
    _count?: EmploymentCountOrderByAggregateInput
    _avg?: EmploymentAvgOrderByAggregateInput
    _max?: EmploymentMaxOrderByAggregateInput
    _min?: EmploymentMinOrderByAggregateInput
    _sum?: EmploymentSumOrderByAggregateInput
  }

  export type EmploymentScalarWhereWithAggregatesInput = {
    AND?: EmploymentScalarWhereWithAggregatesInput | EmploymentScalarWhereWithAggregatesInput[]
    OR?: EmploymentScalarWhereWithAggregatesInput[]
    NOT?: EmploymentScalarWhereWithAggregatesInput | EmploymentScalarWhereWithAggregatesInput[]
    id?: IntWithAggregatesFilter<"Employment"> | number
    userId?: IntWithAggregatesFilter<"Employment"> | number
    posId?: IntWithAggregatesFilter<"Employment"> | number
    deptId?: IntWithAggregatesFilter<"Employment"> | number
    compId?: IntWithAggregatesFilter<"Employment"> | number
    status?: IntWithAggregatesFilter<"Employment"> | number
    description?: StringNullableWithAggregatesFilter<"Employment"> | string | null
    isDelete?: BoolWithAggregatesFilter<"Employment"> | boolean
    createTime?: DateTimeWithAggregatesFilter<"Employment"> | Date | string
    updateTime?: DateTimeWithAggregatesFilter<"Employment"> | Date | string
  }

  export type ClientWhereInput = {
    AND?: ClientWhereInput | ClientWhereInput[]
    OR?: ClientWhereInput[]
    NOT?: ClientWhereInput | ClientWhereInput[]
    id?: IntFilter<"Client"> | number
    clientCode?: StringFilter<"Client"> | string
    clientName?: StringFilter<"Client"> | string
    status?: IntFilter<"Client"> | number
    description?: StringNullableFilter<"Client"> | string | null
    isDelete?: BoolFilter<"Client"> | boolean
    createTime?: DateTimeFilter<"Client"> | Date | string
    updateTime?: DateTimeFilter<"Client"> | Date | string
    role?: RoleListRelationFilter
  }

  export type ClientOrderByWithRelationInput = {
    id?: SortOrder
    clientCode?: SortOrder
    clientName?: SortOrder
    status?: SortOrder
    description?: SortOrderInput | SortOrder
    isDelete?: SortOrder
    createTime?: SortOrder
    updateTime?: SortOrder
    role?: RoleOrderByRelationAggregateInput
    _relevance?: ClientOrderByRelevanceInput
  }

  export type ClientWhereUniqueInput = Prisma.AtLeast<{
    id?: number
    AND?: ClientWhereInput | ClientWhereInput[]
    OR?: ClientWhereInput[]
    NOT?: ClientWhereInput | ClientWhereInput[]
    clientCode?: StringFilter<"Client"> | string
    clientName?: StringFilter<"Client"> | string
    status?: IntFilter<"Client"> | number
    description?: StringNullableFilter<"Client"> | string | null
    isDelete?: BoolFilter<"Client"> | boolean
    createTime?: DateTimeFilter<"Client"> | Date | string
    updateTime?: DateTimeFilter<"Client"> | Date | string
    role?: RoleListRelationFilter
  }, "id">

  export type ClientOrderByWithAggregationInput = {
    id?: SortOrder
    clientCode?: SortOrder
    clientName?: SortOrder
    status?: SortOrder
    description?: SortOrderInput | SortOrder
    isDelete?: SortOrder
    createTime?: SortOrder
    updateTime?: SortOrder
    _count?: ClientCountOrderByAggregateInput
    _avg?: ClientAvgOrderByAggregateInput
    _max?: ClientMaxOrderByAggregateInput
    _min?: ClientMinOrderByAggregateInput
    _sum?: ClientSumOrderByAggregateInput
  }

  export type ClientScalarWhereWithAggregatesInput = {
    AND?: ClientScalarWhereWithAggregatesInput | ClientScalarWhereWithAggregatesInput[]
    OR?: ClientScalarWhereWithAggregatesInput[]
    NOT?: ClientScalarWhereWithAggregatesInput | ClientScalarWhereWithAggregatesInput[]
    id?: IntWithAggregatesFilter<"Client"> | number
    clientCode?: StringWithAggregatesFilter<"Client"> | string
    clientName?: StringWithAggregatesFilter<"Client"> | string
    status?: IntWithAggregatesFilter<"Client"> | number
    description?: StringNullableWithAggregatesFilter<"Client"> | string | null
    isDelete?: BoolWithAggregatesFilter<"Client"> | boolean
    createTime?: DateTimeWithAggregatesFilter<"Client"> | Date | string
    updateTime?: DateTimeWithAggregatesFilter<"Client"> | Date | string
  }

  export type RoleWhereInput = {
    AND?: RoleWhereInput | RoleWhereInput[]
    OR?: RoleWhereInput[]
    NOT?: RoleWhereInput | RoleWhereInput[]
    id?: IntFilter<"Role"> | number
    roleCode?: StringFilter<"Role"> | string
    roleName?: StringFilter<"Role"> | string
    clientId?: IntFilter<"Role"> | number
    status?: IntFilter<"Role"> | number
    description?: StringNullableFilter<"Role"> | string | null
    isDelete?: BoolFilter<"Role"> | boolean
    createTime?: DateTimeFilter<"Role"> | Date | string
    updateTime?: DateTimeFilter<"Role"> | Date | string
    client?: XOR<ClientScalarRelationFilter, ClientWhereInput>
    positions?: PositionRoleListRelationFilter
    organizations?: OrganizationRoleListRelationFilter
    employments?: EmploymentRoleListRelationFilter
    privileges?: RolePrivilegeListRelationFilter
  }

  export type RoleOrderByWithRelationInput = {
    id?: SortOrder
    roleCode?: SortOrder
    roleName?: SortOrder
    clientId?: SortOrder
    status?: SortOrder
    description?: SortOrderInput | SortOrder
    isDelete?: SortOrder
    createTime?: SortOrder
    updateTime?: SortOrder
    client?: ClientOrderByWithRelationInput
    positions?: PositionRoleOrderByRelationAggregateInput
    organizations?: OrganizationRoleOrderByRelationAggregateInput
    employments?: EmploymentRoleOrderByRelationAggregateInput
    privileges?: RolePrivilegeOrderByRelationAggregateInput
    _relevance?: RoleOrderByRelevanceInput
  }

  export type RoleWhereUniqueInput = Prisma.AtLeast<{
    id?: number
    AND?: RoleWhereInput | RoleWhereInput[]
    OR?: RoleWhereInput[]
    NOT?: RoleWhereInput | RoleWhereInput[]
    roleCode?: StringFilter<"Role"> | string
    roleName?: StringFilter<"Role"> | string
    clientId?: IntFilter<"Role"> | number
    status?: IntFilter<"Role"> | number
    description?: StringNullableFilter<"Role"> | string | null
    isDelete?: BoolFilter<"Role"> | boolean
    createTime?: DateTimeFilter<"Role"> | Date | string
    updateTime?: DateTimeFilter<"Role"> | Date | string
    client?: XOR<ClientScalarRelationFilter, ClientWhereInput>
    positions?: PositionRoleListRelationFilter
    organizations?: OrganizationRoleListRelationFilter
    employments?: EmploymentRoleListRelationFilter
    privileges?: RolePrivilegeListRelationFilter
  }, "id">

  export type RoleOrderByWithAggregationInput = {
    id?: SortOrder
    roleCode?: SortOrder
    roleName?: SortOrder
    clientId?: SortOrder
    status?: SortOrder
    description?: SortOrderInput | SortOrder
    isDelete?: SortOrder
    createTime?: SortOrder
    updateTime?: SortOrder
    _count?: RoleCountOrderByAggregateInput
    _avg?: RoleAvgOrderByAggregateInput
    _max?: RoleMaxOrderByAggregateInput
    _min?: RoleMinOrderByAggregateInput
    _sum?: RoleSumOrderByAggregateInput
  }

  export type RoleScalarWhereWithAggregatesInput = {
    AND?: RoleScalarWhereWithAggregatesInput | RoleScalarWhereWithAggregatesInput[]
    OR?: RoleScalarWhereWithAggregatesInput[]
    NOT?: RoleScalarWhereWithAggregatesInput | RoleScalarWhereWithAggregatesInput[]
    id?: IntWithAggregatesFilter<"Role"> | number
    roleCode?: StringWithAggregatesFilter<"Role"> | string
    roleName?: StringWithAggregatesFilter<"Role"> | string
    clientId?: IntWithAggregatesFilter<"Role"> | number
    status?: IntWithAggregatesFilter<"Role"> | number
    description?: StringNullableWithAggregatesFilter<"Role"> | string | null
    isDelete?: BoolWithAggregatesFilter<"Role"> | boolean
    createTime?: DateTimeWithAggregatesFilter<"Role"> | Date | string
    updateTime?: DateTimeWithAggregatesFilter<"Role"> | Date | string
  }

  export type PositionRoleWhereInput = {
    AND?: PositionRoleWhereInput | PositionRoleWhereInput[]
    OR?: PositionRoleWhereInput[]
    NOT?: PositionRoleWhereInput | PositionRoleWhereInput[]
    positionId?: IntFilter<"PositionRole"> | number
    roleId?: IntFilter<"PositionRole"> | number
    position?: XOR<PositionScalarRelationFilter, PositionWhereInput>
    role?: XOR<RoleScalarRelationFilter, RoleWhereInput>
  }

  export type PositionRoleOrderByWithRelationInput = {
    positionId?: SortOrder
    roleId?: SortOrder
    position?: PositionOrderByWithRelationInput
    role?: RoleOrderByWithRelationInput
  }

  export type PositionRoleWhereUniqueInput = Prisma.AtLeast<{
    positionId_roleId?: PositionRolePositionIdRoleIdCompoundUniqueInput
    AND?: PositionRoleWhereInput | PositionRoleWhereInput[]
    OR?: PositionRoleWhereInput[]
    NOT?: PositionRoleWhereInput | PositionRoleWhereInput[]
    positionId?: IntFilter<"PositionRole"> | number
    roleId?: IntFilter<"PositionRole"> | number
    position?: XOR<PositionScalarRelationFilter, PositionWhereInput>
    role?: XOR<RoleScalarRelationFilter, RoleWhereInput>
  }, "positionId_roleId">

  export type PositionRoleOrderByWithAggregationInput = {
    positionId?: SortOrder
    roleId?: SortOrder
    _count?: PositionRoleCountOrderByAggregateInput
    _avg?: PositionRoleAvgOrderByAggregateInput
    _max?: PositionRoleMaxOrderByAggregateInput
    _min?: PositionRoleMinOrderByAggregateInput
    _sum?: PositionRoleSumOrderByAggregateInput
  }

  export type PositionRoleScalarWhereWithAggregatesInput = {
    AND?: PositionRoleScalarWhereWithAggregatesInput | PositionRoleScalarWhereWithAggregatesInput[]
    OR?: PositionRoleScalarWhereWithAggregatesInput[]
    NOT?: PositionRoleScalarWhereWithAggregatesInput | PositionRoleScalarWhereWithAggregatesInput[]
    positionId?: IntWithAggregatesFilter<"PositionRole"> | number
    roleId?: IntWithAggregatesFilter<"PositionRole"> | number
  }

  export type EmploymentRoleWhereInput = {
    AND?: EmploymentRoleWhereInput | EmploymentRoleWhereInput[]
    OR?: EmploymentRoleWhereInput[]
    NOT?: EmploymentRoleWhereInput | EmploymentRoleWhereInput[]
    employmentId?: IntFilter<"EmploymentRole"> | number
    roleId?: IntFilter<"EmploymentRole"> | number
    employment?: XOR<EmploymentScalarRelationFilter, EmploymentWhereInput>
    role?: XOR<RoleScalarRelationFilter, RoleWhereInput>
  }

  export type EmploymentRoleOrderByWithRelationInput = {
    employmentId?: SortOrder
    roleId?: SortOrder
    employment?: EmploymentOrderByWithRelationInput
    role?: RoleOrderByWithRelationInput
  }

  export type EmploymentRoleWhereUniqueInput = Prisma.AtLeast<{
    employmentId_roleId?: EmploymentRoleEmploymentIdRoleIdCompoundUniqueInput
    AND?: EmploymentRoleWhereInput | EmploymentRoleWhereInput[]
    OR?: EmploymentRoleWhereInput[]
    NOT?: EmploymentRoleWhereInput | EmploymentRoleWhereInput[]
    employmentId?: IntFilter<"EmploymentRole"> | number
    roleId?: IntFilter<"EmploymentRole"> | number
    employment?: XOR<EmploymentScalarRelationFilter, EmploymentWhereInput>
    role?: XOR<RoleScalarRelationFilter, RoleWhereInput>
  }, "employmentId_roleId">

  export type EmploymentRoleOrderByWithAggregationInput = {
    employmentId?: SortOrder
    roleId?: SortOrder
    _count?: EmploymentRoleCountOrderByAggregateInput
    _avg?: EmploymentRoleAvgOrderByAggregateInput
    _max?: EmploymentRoleMaxOrderByAggregateInput
    _min?: EmploymentRoleMinOrderByAggregateInput
    _sum?: EmploymentRoleSumOrderByAggregateInput
  }

  export type EmploymentRoleScalarWhereWithAggregatesInput = {
    AND?: EmploymentRoleScalarWhereWithAggregatesInput | EmploymentRoleScalarWhereWithAggregatesInput[]
    OR?: EmploymentRoleScalarWhereWithAggregatesInput[]
    NOT?: EmploymentRoleScalarWhereWithAggregatesInput | EmploymentRoleScalarWhereWithAggregatesInput[]
    employmentId?: IntWithAggregatesFilter<"EmploymentRole"> | number
    roleId?: IntWithAggregatesFilter<"EmploymentRole"> | number
  }

  export type OrganizationRoleWhereInput = {
    AND?: OrganizationRoleWhereInput | OrganizationRoleWhereInput[]
    OR?: OrganizationRoleWhereInput[]
    NOT?: OrganizationRoleWhereInput | OrganizationRoleWhereInput[]
    organizationId?: IntFilter<"OrganizationRole"> | number
    roleId?: IntFilter<"OrganizationRole"> | number
    organization?: XOR<OrganizationScalarRelationFilter, OrganizationWhereInput>
    role?: XOR<RoleScalarRelationFilter, RoleWhereInput>
  }

  export type OrganizationRoleOrderByWithRelationInput = {
    organizationId?: SortOrder
    roleId?: SortOrder
    organization?: OrganizationOrderByWithRelationInput
    role?: RoleOrderByWithRelationInput
  }

  export type OrganizationRoleWhereUniqueInput = Prisma.AtLeast<{
    organizationId_roleId?: OrganizationRoleOrganizationIdRoleIdCompoundUniqueInput
    AND?: OrganizationRoleWhereInput | OrganizationRoleWhereInput[]
    OR?: OrganizationRoleWhereInput[]
    NOT?: OrganizationRoleWhereInput | OrganizationRoleWhereInput[]
    organizationId?: IntFilter<"OrganizationRole"> | number
    roleId?: IntFilter<"OrganizationRole"> | number
    organization?: XOR<OrganizationScalarRelationFilter, OrganizationWhereInput>
    role?: XOR<RoleScalarRelationFilter, RoleWhereInput>
  }, "organizationId_roleId">

  export type OrganizationRoleOrderByWithAggregationInput = {
    organizationId?: SortOrder
    roleId?: SortOrder
    _count?: OrganizationRoleCountOrderByAggregateInput
    _avg?: OrganizationRoleAvgOrderByAggregateInput
    _max?: OrganizationRoleMaxOrderByAggregateInput
    _min?: OrganizationRoleMinOrderByAggregateInput
    _sum?: OrganizationRoleSumOrderByAggregateInput
  }

  export type OrganizationRoleScalarWhereWithAggregatesInput = {
    AND?: OrganizationRoleScalarWhereWithAggregatesInput | OrganizationRoleScalarWhereWithAggregatesInput[]
    OR?: OrganizationRoleScalarWhereWithAggregatesInput[]
    NOT?: OrganizationRoleScalarWhereWithAggregatesInput | OrganizationRoleScalarWhereWithAggregatesInput[]
    organizationId?: IntWithAggregatesFilter<"OrganizationRole"> | number
    roleId?: IntWithAggregatesFilter<"OrganizationRole"> | number
  }

  export type AuthObjectWhereInput = {
    AND?: AuthObjectWhereInput | AuthObjectWhereInput[]
    OR?: AuthObjectWhereInput[]
    NOT?: AuthObjectWhereInput | AuthObjectWhereInput[]
    id?: IntFilter<"AuthObject"> | number
    objectCode?: StringFilter<"AuthObject"> | string
    objectName?: StringFilter<"AuthObject"> | string
    objectType?: StringFilter<"AuthObject"> | string
    path?: StringNullableFilter<"AuthObject"> | string | null
    authFields?: JsonNullableFilter<"AuthObject">
    privileges?: PrivilegeListRelationFilter
  }

  export type AuthObjectOrderByWithRelationInput = {
    id?: SortOrder
    objectCode?: SortOrder
    objectName?: SortOrder
    objectType?: SortOrder
    path?: SortOrderInput | SortOrder
    authFields?: SortOrderInput | SortOrder
    privileges?: PrivilegeOrderByRelationAggregateInput
    _relevance?: AuthObjectOrderByRelevanceInput
  }

  export type AuthObjectWhereUniqueInput = Prisma.AtLeast<{
    id?: number
    AND?: AuthObjectWhereInput | AuthObjectWhereInput[]
    OR?: AuthObjectWhereInput[]
    NOT?: AuthObjectWhereInput | AuthObjectWhereInput[]
    objectCode?: StringFilter<"AuthObject"> | string
    objectName?: StringFilter<"AuthObject"> | string
    objectType?: StringFilter<"AuthObject"> | string
    path?: StringNullableFilter<"AuthObject"> | string | null
    authFields?: JsonNullableFilter<"AuthObject">
    privileges?: PrivilegeListRelationFilter
  }, "id">

  export type AuthObjectOrderByWithAggregationInput = {
    id?: SortOrder
    objectCode?: SortOrder
    objectName?: SortOrder
    objectType?: SortOrder
    path?: SortOrderInput | SortOrder
    authFields?: SortOrderInput | SortOrder
    _count?: AuthObjectCountOrderByAggregateInput
    _avg?: AuthObjectAvgOrderByAggregateInput
    _max?: AuthObjectMaxOrderByAggregateInput
    _min?: AuthObjectMinOrderByAggregateInput
    _sum?: AuthObjectSumOrderByAggregateInput
  }

  export type AuthObjectScalarWhereWithAggregatesInput = {
    AND?: AuthObjectScalarWhereWithAggregatesInput | AuthObjectScalarWhereWithAggregatesInput[]
    OR?: AuthObjectScalarWhereWithAggregatesInput[]
    NOT?: AuthObjectScalarWhereWithAggregatesInput | AuthObjectScalarWhereWithAggregatesInput[]
    id?: IntWithAggregatesFilter<"AuthObject"> | number
    objectCode?: StringWithAggregatesFilter<"AuthObject"> | string
    objectName?: StringWithAggregatesFilter<"AuthObject"> | string
    objectType?: StringWithAggregatesFilter<"AuthObject"> | string
    path?: StringNullableWithAggregatesFilter<"AuthObject"> | string | null
    authFields?: JsonNullableWithAggregatesFilter<"AuthObject">
  }

  export type PrivilegeWhereInput = {
    AND?: PrivilegeWhereInput | PrivilegeWhereInput[]
    OR?: PrivilegeWhereInput[]
    NOT?: PrivilegeWhereInput | PrivilegeWhereInput[]
    id?: IntFilter<"Privilege"> | number
    privilegeCode?: StringFilter<"Privilege"> | string
    privilegeName?: StringFilter<"Privilege"> | string
    objectId?: IntFilter<"Privilege"> | number
    fieldValues?: JsonNullableFilter<"Privilege">
    status?: IntFilter<"Privilege"> | number
    description?: StringNullableFilter<"Privilege"> | string | null
    isDelete?: BoolFilter<"Privilege"> | boolean
    createTime?: DateTimeFilter<"Privilege"> | Date | string
    updateTime?: DateTimeFilter<"Privilege"> | Date | string
    roles?: RolePrivilegeListRelationFilter
    object?: XOR<AuthObjectScalarRelationFilter, AuthObjectWhereInput>
  }

  export type PrivilegeOrderByWithRelationInput = {
    id?: SortOrder
    privilegeCode?: SortOrder
    privilegeName?: SortOrder
    objectId?: SortOrder
    fieldValues?: SortOrderInput | SortOrder
    status?: SortOrder
    description?: SortOrderInput | SortOrder
    isDelete?: SortOrder
    createTime?: SortOrder
    updateTime?: SortOrder
    roles?: RolePrivilegeOrderByRelationAggregateInput
    object?: AuthObjectOrderByWithRelationInput
    _relevance?: PrivilegeOrderByRelevanceInput
  }

  export type PrivilegeWhereUniqueInput = Prisma.AtLeast<{
    id?: number
    AND?: PrivilegeWhereInput | PrivilegeWhereInput[]
    OR?: PrivilegeWhereInput[]
    NOT?: PrivilegeWhereInput | PrivilegeWhereInput[]
    privilegeCode?: StringFilter<"Privilege"> | string
    privilegeName?: StringFilter<"Privilege"> | string
    objectId?: IntFilter<"Privilege"> | number
    fieldValues?: JsonNullableFilter<"Privilege">
    status?: IntFilter<"Privilege"> | number
    description?: StringNullableFilter<"Privilege"> | string | null
    isDelete?: BoolFilter<"Privilege"> | boolean
    createTime?: DateTimeFilter<"Privilege"> | Date | string
    updateTime?: DateTimeFilter<"Privilege"> | Date | string
    roles?: RolePrivilegeListRelationFilter
    object?: XOR<AuthObjectScalarRelationFilter, AuthObjectWhereInput>
  }, "id">

  export type PrivilegeOrderByWithAggregationInput = {
    id?: SortOrder
    privilegeCode?: SortOrder
    privilegeName?: SortOrder
    objectId?: SortOrder
    fieldValues?: SortOrderInput | SortOrder
    status?: SortOrder
    description?: SortOrderInput | SortOrder
    isDelete?: SortOrder
    createTime?: SortOrder
    updateTime?: SortOrder
    _count?: PrivilegeCountOrderByAggregateInput
    _avg?: PrivilegeAvgOrderByAggregateInput
    _max?: PrivilegeMaxOrderByAggregateInput
    _min?: PrivilegeMinOrderByAggregateInput
    _sum?: PrivilegeSumOrderByAggregateInput
  }

  export type PrivilegeScalarWhereWithAggregatesInput = {
    AND?: PrivilegeScalarWhereWithAggregatesInput | PrivilegeScalarWhereWithAggregatesInput[]
    OR?: PrivilegeScalarWhereWithAggregatesInput[]
    NOT?: PrivilegeScalarWhereWithAggregatesInput | PrivilegeScalarWhereWithAggregatesInput[]
    id?: IntWithAggregatesFilter<"Privilege"> | number
    privilegeCode?: StringWithAggregatesFilter<"Privilege"> | string
    privilegeName?: StringWithAggregatesFilter<"Privilege"> | string
    objectId?: IntWithAggregatesFilter<"Privilege"> | number
    fieldValues?: JsonNullableWithAggregatesFilter<"Privilege">
    status?: IntWithAggregatesFilter<"Privilege"> | number
    description?: StringNullableWithAggregatesFilter<"Privilege"> | string | null
    isDelete?: BoolWithAggregatesFilter<"Privilege"> | boolean
    createTime?: DateTimeWithAggregatesFilter<"Privilege"> | Date | string
    updateTime?: DateTimeWithAggregatesFilter<"Privilege"> | Date | string
  }

  export type PrivilegeDelegationWhereInput = {
    AND?: PrivilegeDelegationWhereInput | PrivilegeDelegationWhereInput[]
    OR?: PrivilegeDelegationWhereInput[]
    NOT?: PrivilegeDelegationWhereInput | PrivilegeDelegationWhereInput[]
    id?: IntFilter<"PrivilegeDelegation"> | number
    delegatorUserId?: IntFilter<"PrivilegeDelegation"> | number
    delegateeUserId?: IntFilter<"PrivilegeDelegation"> | number
    startTime?: DateTimeFilter<"PrivilegeDelegation"> | Date | string
    endTime?: DateTimeFilter<"PrivilegeDelegation"> | Date | string
    status?: IntFilter<"PrivilegeDelegation"> | number
    description?: StringNullableFilter<"PrivilegeDelegation"> | string | null
    isDelete?: BoolFilter<"PrivilegeDelegation"> | boolean
    createTime?: DateTimeFilter<"PrivilegeDelegation"> | Date | string
    updateTime?: DateTimeFilter<"PrivilegeDelegation"> | Date | string
    delegatorUser?: XOR<UserScalarRelationFilter, UserWhereInput>
    delegateeUser?: XOR<UserScalarRelationFilter, UserWhereInput>
    delegationDetails?: DelegationDetailListRelationFilter
  }

  export type PrivilegeDelegationOrderByWithRelationInput = {
    id?: SortOrder
    delegatorUserId?: SortOrder
    delegateeUserId?: SortOrder
    startTime?: SortOrder
    endTime?: SortOrder
    status?: SortOrder
    description?: SortOrderInput | SortOrder
    isDelete?: SortOrder
    createTime?: SortOrder
    updateTime?: SortOrder
    delegatorUser?: UserOrderByWithRelationInput
    delegateeUser?: UserOrderByWithRelationInput
    delegationDetails?: DelegationDetailOrderByRelationAggregateInput
    _relevance?: PrivilegeDelegationOrderByRelevanceInput
  }

  export type PrivilegeDelegationWhereUniqueInput = Prisma.AtLeast<{
    id?: number
    AND?: PrivilegeDelegationWhereInput | PrivilegeDelegationWhereInput[]
    OR?: PrivilegeDelegationWhereInput[]
    NOT?: PrivilegeDelegationWhereInput | PrivilegeDelegationWhereInput[]
    delegatorUserId?: IntFilter<"PrivilegeDelegation"> | number
    delegateeUserId?: IntFilter<"PrivilegeDelegation"> | number
    startTime?: DateTimeFilter<"PrivilegeDelegation"> | Date | string
    endTime?: DateTimeFilter<"PrivilegeDelegation"> | Date | string
    status?: IntFilter<"PrivilegeDelegation"> | number
    description?: StringNullableFilter<"PrivilegeDelegation"> | string | null
    isDelete?: BoolFilter<"PrivilegeDelegation"> | boolean
    createTime?: DateTimeFilter<"PrivilegeDelegation"> | Date | string
    updateTime?: DateTimeFilter<"PrivilegeDelegation"> | Date | string
    delegatorUser?: XOR<UserScalarRelationFilter, UserWhereInput>
    delegateeUser?: XOR<UserScalarRelationFilter, UserWhereInput>
    delegationDetails?: DelegationDetailListRelationFilter
  }, "id">

  export type PrivilegeDelegationOrderByWithAggregationInput = {
    id?: SortOrder
    delegatorUserId?: SortOrder
    delegateeUserId?: SortOrder
    startTime?: SortOrder
    endTime?: SortOrder
    status?: SortOrder
    description?: SortOrderInput | SortOrder
    isDelete?: SortOrder
    createTime?: SortOrder
    updateTime?: SortOrder
    _count?: PrivilegeDelegationCountOrderByAggregateInput
    _avg?: PrivilegeDelegationAvgOrderByAggregateInput
    _max?: PrivilegeDelegationMaxOrderByAggregateInput
    _min?: PrivilegeDelegationMinOrderByAggregateInput
    _sum?: PrivilegeDelegationSumOrderByAggregateInput
  }

  export type PrivilegeDelegationScalarWhereWithAggregatesInput = {
    AND?: PrivilegeDelegationScalarWhereWithAggregatesInput | PrivilegeDelegationScalarWhereWithAggregatesInput[]
    OR?: PrivilegeDelegationScalarWhereWithAggregatesInput[]
    NOT?: PrivilegeDelegationScalarWhereWithAggregatesInput | PrivilegeDelegationScalarWhereWithAggregatesInput[]
    id?: IntWithAggregatesFilter<"PrivilegeDelegation"> | number
    delegatorUserId?: IntWithAggregatesFilter<"PrivilegeDelegation"> | number
    delegateeUserId?: IntWithAggregatesFilter<"PrivilegeDelegation"> | number
    startTime?: DateTimeWithAggregatesFilter<"PrivilegeDelegation"> | Date | string
    endTime?: DateTimeWithAggregatesFilter<"PrivilegeDelegation"> | Date | string
    status?: IntWithAggregatesFilter<"PrivilegeDelegation"> | number
    description?: StringNullableWithAggregatesFilter<"PrivilegeDelegation"> | string | null
    isDelete?: BoolWithAggregatesFilter<"PrivilegeDelegation"> | boolean
    createTime?: DateTimeWithAggregatesFilter<"PrivilegeDelegation"> | Date | string
    updateTime?: DateTimeWithAggregatesFilter<"PrivilegeDelegation"> | Date | string
  }

  export type DelegationDetailWhereInput = {
    AND?: DelegationDetailWhereInput | DelegationDetailWhereInput[]
    OR?: DelegationDetailWhereInput[]
    NOT?: DelegationDetailWhereInput | DelegationDetailWhereInput[]
    delegationId?: IntFilter<"DelegationDetail"> | number
    resourceCode?: StringFilter<"DelegationDetail"> | string
    delegation?: XOR<PrivilegeDelegationScalarRelationFilter, PrivilegeDelegationWhereInput>
  }

  export type DelegationDetailOrderByWithRelationInput = {
    delegationId?: SortOrder
    resourceCode?: SortOrder
    delegation?: PrivilegeDelegationOrderByWithRelationInput
    _relevance?: DelegationDetailOrderByRelevanceInput
  }

  export type DelegationDetailWhereUniqueInput = Prisma.AtLeast<{
    delegationId_resourceCode?: DelegationDetailDelegationIdResourceCodeCompoundUniqueInput
    AND?: DelegationDetailWhereInput | DelegationDetailWhereInput[]
    OR?: DelegationDetailWhereInput[]
    NOT?: DelegationDetailWhereInput | DelegationDetailWhereInput[]
    delegationId?: IntFilter<"DelegationDetail"> | number
    resourceCode?: StringFilter<"DelegationDetail"> | string
    delegation?: XOR<PrivilegeDelegationScalarRelationFilter, PrivilegeDelegationWhereInput>
  }, "delegationId_resourceCode">

  export type DelegationDetailOrderByWithAggregationInput = {
    delegationId?: SortOrder
    resourceCode?: SortOrder
    _count?: DelegationDetailCountOrderByAggregateInput
    _avg?: DelegationDetailAvgOrderByAggregateInput
    _max?: DelegationDetailMaxOrderByAggregateInput
    _min?: DelegationDetailMinOrderByAggregateInput
    _sum?: DelegationDetailSumOrderByAggregateInput
  }

  export type DelegationDetailScalarWhereWithAggregatesInput = {
    AND?: DelegationDetailScalarWhereWithAggregatesInput | DelegationDetailScalarWhereWithAggregatesInput[]
    OR?: DelegationDetailScalarWhereWithAggregatesInput[]
    NOT?: DelegationDetailScalarWhereWithAggregatesInput | DelegationDetailScalarWhereWithAggregatesInput[]
    delegationId?: IntWithAggregatesFilter<"DelegationDetail"> | number
    resourceCode?: StringWithAggregatesFilter<"DelegationDetail"> | string
  }

  export type RolePrivilegeWhereInput = {
    AND?: RolePrivilegeWhereInput | RolePrivilegeWhereInput[]
    OR?: RolePrivilegeWhereInput[]
    NOT?: RolePrivilegeWhereInput | RolePrivilegeWhereInput[]
    roleId?: IntFilter<"RolePrivilege"> | number
    privilegeId?: IntFilter<"RolePrivilege"> | number
    role?: XOR<RoleScalarRelationFilter, RoleWhereInput>
    privilege?: XOR<PrivilegeScalarRelationFilter, PrivilegeWhereInput>
  }

  export type RolePrivilegeOrderByWithRelationInput = {
    roleId?: SortOrder
    privilegeId?: SortOrder
    role?: RoleOrderByWithRelationInput
    privilege?: PrivilegeOrderByWithRelationInput
  }

  export type RolePrivilegeWhereUniqueInput = Prisma.AtLeast<{
    roleId_privilegeId?: RolePrivilegeRoleIdPrivilegeIdCompoundUniqueInput
    AND?: RolePrivilegeWhereInput | RolePrivilegeWhereInput[]
    OR?: RolePrivilegeWhereInput[]
    NOT?: RolePrivilegeWhereInput | RolePrivilegeWhereInput[]
    roleId?: IntFilter<"RolePrivilege"> | number
    privilegeId?: IntFilter<"RolePrivilege"> | number
    role?: XOR<RoleScalarRelationFilter, RoleWhereInput>
    privilege?: XOR<PrivilegeScalarRelationFilter, PrivilegeWhereInput>
  }, "roleId_privilegeId">

  export type RolePrivilegeOrderByWithAggregationInput = {
    roleId?: SortOrder
    privilegeId?: SortOrder
    _count?: RolePrivilegeCountOrderByAggregateInput
    _avg?: RolePrivilegeAvgOrderByAggregateInput
    _max?: RolePrivilegeMaxOrderByAggregateInput
    _min?: RolePrivilegeMinOrderByAggregateInput
    _sum?: RolePrivilegeSumOrderByAggregateInput
  }

  export type RolePrivilegeScalarWhereWithAggregatesInput = {
    AND?: RolePrivilegeScalarWhereWithAggregatesInput | RolePrivilegeScalarWhereWithAggregatesInput[]
    OR?: RolePrivilegeScalarWhereWithAggregatesInput[]
    NOT?: RolePrivilegeScalarWhereWithAggregatesInput | RolePrivilegeScalarWhereWithAggregatesInput[]
    roleId?: IntWithAggregatesFilter<"RolePrivilege"> | number
    privilegeId?: IntWithAggregatesFilter<"RolePrivilege"> | number
  }

  export type UserCreateInput = {
    username: string
    name: string
    password?: string | null
    mobilePhone?: string | null
    userType?: string | null
    status?: number
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    employments?: EmploymentCreateNestedManyWithoutUserInput
    delegationTo?: PrivilegeDelegationCreateNestedManyWithoutDelegatorUserInput
    delegationFrom?: PrivilegeDelegationCreateNestedManyWithoutDelegateeUserInput
  }

  export type UserUncheckedCreateInput = {
    id?: number
    username: string
    name: string
    password?: string | null
    mobilePhone?: string | null
    userType?: string | null
    status?: number
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    employments?: EmploymentUncheckedCreateNestedManyWithoutUserInput
    delegationTo?: PrivilegeDelegationUncheckedCreateNestedManyWithoutDelegatorUserInput
    delegationFrom?: PrivilegeDelegationUncheckedCreateNestedManyWithoutDelegateeUserInput
  }

  export type UserUpdateInput = {
    username?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    password?: NullableStringFieldUpdateOperationsInput | string | null
    mobilePhone?: NullableStringFieldUpdateOperationsInput | string | null
    userType?: NullableStringFieldUpdateOperationsInput | string | null
    status?: IntFieldUpdateOperationsInput | number
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    employments?: EmploymentUpdateManyWithoutUserNestedInput
    delegationTo?: PrivilegeDelegationUpdateManyWithoutDelegatorUserNestedInput
    delegationFrom?: PrivilegeDelegationUpdateManyWithoutDelegateeUserNestedInput
  }

  export type UserUncheckedUpdateInput = {
    id?: IntFieldUpdateOperationsInput | number
    username?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    password?: NullableStringFieldUpdateOperationsInput | string | null
    mobilePhone?: NullableStringFieldUpdateOperationsInput | string | null
    userType?: NullableStringFieldUpdateOperationsInput | string | null
    status?: IntFieldUpdateOperationsInput | number
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    employments?: EmploymentUncheckedUpdateManyWithoutUserNestedInput
    delegationTo?: PrivilegeDelegationUncheckedUpdateManyWithoutDelegatorUserNestedInput
    delegationFrom?: PrivilegeDelegationUncheckedUpdateManyWithoutDelegateeUserNestedInput
  }

  export type UserCreateManyInput = {
    id?: number
    username: string
    name: string
    password?: string | null
    mobilePhone?: string | null
    userType?: string | null
    status?: number
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
  }

  export type UserUpdateManyMutationInput = {
    username?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    password?: NullableStringFieldUpdateOperationsInput | string | null
    mobilePhone?: NullableStringFieldUpdateOperationsInput | string | null
    userType?: NullableStringFieldUpdateOperationsInput | string | null
    status?: IntFieldUpdateOperationsInput | number
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type UserUncheckedUpdateManyInput = {
    id?: IntFieldUpdateOperationsInput | number
    username?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    password?: NullableStringFieldUpdateOperationsInput | string | null
    mobilePhone?: NullableStringFieldUpdateOperationsInput | string | null
    userType?: NullableStringFieldUpdateOperationsInput | string | null
    status?: IntFieldUpdateOperationsInput | number
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type OrganizationCreateInput = {
    orgCode: string
    orgName: string
    parentId?: number
    businessParentId?: number
    level: number
    orgType: string
    orderNum?: number
    isVirtual?: boolean
    isEntity?: boolean
    status?: boolean
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    deptEmployments?: EmploymentCreateNestedManyWithoutDeptartmentInput
    compEmployments?: EmploymentCreateNestedManyWithoutCompanyInput
    roles?: OrganizationRoleCreateNestedManyWithoutOrganizationInput
  }

  export type OrganizationUncheckedCreateInput = {
    id?: number
    orgCode: string
    orgName: string
    parentId?: number
    businessParentId?: number
    level: number
    orgType: string
    orderNum?: number
    isVirtual?: boolean
    isEntity?: boolean
    status?: boolean
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    deptEmployments?: EmploymentUncheckedCreateNestedManyWithoutDeptartmentInput
    compEmployments?: EmploymentUncheckedCreateNestedManyWithoutCompanyInput
    roles?: OrganizationRoleUncheckedCreateNestedManyWithoutOrganizationInput
  }

  export type OrganizationUpdateInput = {
    orgCode?: StringFieldUpdateOperationsInput | string
    orgName?: StringFieldUpdateOperationsInput | string
    parentId?: IntFieldUpdateOperationsInput | number
    businessParentId?: IntFieldUpdateOperationsInput | number
    level?: IntFieldUpdateOperationsInput | number
    orgType?: StringFieldUpdateOperationsInput | string
    orderNum?: IntFieldUpdateOperationsInput | number
    isVirtual?: BoolFieldUpdateOperationsInput | boolean
    isEntity?: BoolFieldUpdateOperationsInput | boolean
    status?: BoolFieldUpdateOperationsInput | boolean
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    deptEmployments?: EmploymentUpdateManyWithoutDeptartmentNestedInput
    compEmployments?: EmploymentUpdateManyWithoutCompanyNestedInput
    roles?: OrganizationRoleUpdateManyWithoutOrganizationNestedInput
  }

  export type OrganizationUncheckedUpdateInput = {
    id?: IntFieldUpdateOperationsInput | number
    orgCode?: StringFieldUpdateOperationsInput | string
    orgName?: StringFieldUpdateOperationsInput | string
    parentId?: IntFieldUpdateOperationsInput | number
    businessParentId?: IntFieldUpdateOperationsInput | number
    level?: IntFieldUpdateOperationsInput | number
    orgType?: StringFieldUpdateOperationsInput | string
    orderNum?: IntFieldUpdateOperationsInput | number
    isVirtual?: BoolFieldUpdateOperationsInput | boolean
    isEntity?: BoolFieldUpdateOperationsInput | boolean
    status?: BoolFieldUpdateOperationsInput | boolean
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    deptEmployments?: EmploymentUncheckedUpdateManyWithoutDeptartmentNestedInput
    compEmployments?: EmploymentUncheckedUpdateManyWithoutCompanyNestedInput
    roles?: OrganizationRoleUncheckedUpdateManyWithoutOrganizationNestedInput
  }

  export type OrganizationCreateManyInput = {
    id?: number
    orgCode: string
    orgName: string
    parentId?: number
    businessParentId?: number
    level: number
    orgType: string
    orderNum?: number
    isVirtual?: boolean
    isEntity?: boolean
    status?: boolean
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
  }

  export type OrganizationUpdateManyMutationInput = {
    orgCode?: StringFieldUpdateOperationsInput | string
    orgName?: StringFieldUpdateOperationsInput | string
    parentId?: IntFieldUpdateOperationsInput | number
    businessParentId?: IntFieldUpdateOperationsInput | number
    level?: IntFieldUpdateOperationsInput | number
    orgType?: StringFieldUpdateOperationsInput | string
    orderNum?: IntFieldUpdateOperationsInput | number
    isVirtual?: BoolFieldUpdateOperationsInput | boolean
    isEntity?: BoolFieldUpdateOperationsInput | boolean
    status?: BoolFieldUpdateOperationsInput | boolean
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type OrganizationUncheckedUpdateManyInput = {
    id?: IntFieldUpdateOperationsInput | number
    orgCode?: StringFieldUpdateOperationsInput | string
    orgName?: StringFieldUpdateOperationsInput | string
    parentId?: IntFieldUpdateOperationsInput | number
    businessParentId?: IntFieldUpdateOperationsInput | number
    level?: IntFieldUpdateOperationsInput | number
    orgType?: StringFieldUpdateOperationsInput | string
    orderNum?: IntFieldUpdateOperationsInput | number
    isVirtual?: BoolFieldUpdateOperationsInput | boolean
    isEntity?: BoolFieldUpdateOperationsInput | boolean
    status?: BoolFieldUpdateOperationsInput | boolean
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type PositionCreateInput = {
    posCode: string
    posName: string
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    employments?: EmploymentCreateNestedManyWithoutPositionInput
    roles?: PositionRoleCreateNestedManyWithoutPositionInput
  }

  export type PositionUncheckedCreateInput = {
    id?: number
    posCode: string
    posName: string
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    employments?: EmploymentUncheckedCreateNestedManyWithoutPositionInput
    roles?: PositionRoleUncheckedCreateNestedManyWithoutPositionInput
  }

  export type PositionUpdateInput = {
    posCode?: StringFieldUpdateOperationsInput | string
    posName?: StringFieldUpdateOperationsInput | string
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    employments?: EmploymentUpdateManyWithoutPositionNestedInput
    roles?: PositionRoleUpdateManyWithoutPositionNestedInput
  }

  export type PositionUncheckedUpdateInput = {
    id?: IntFieldUpdateOperationsInput | number
    posCode?: StringFieldUpdateOperationsInput | string
    posName?: StringFieldUpdateOperationsInput | string
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    employments?: EmploymentUncheckedUpdateManyWithoutPositionNestedInput
    roles?: PositionRoleUncheckedUpdateManyWithoutPositionNestedInput
  }

  export type PositionCreateManyInput = {
    id?: number
    posCode: string
    posName: string
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
  }

  export type PositionUpdateManyMutationInput = {
    posCode?: StringFieldUpdateOperationsInput | string
    posName?: StringFieldUpdateOperationsInput | string
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type PositionUncheckedUpdateManyInput = {
    id?: IntFieldUpdateOperationsInput | number
    posCode?: StringFieldUpdateOperationsInput | string
    posName?: StringFieldUpdateOperationsInput | string
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type EmploymentCreateInput = {
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    user: UserCreateNestedOneWithoutEmploymentsInput
    deptartment: OrganizationCreateNestedOneWithoutDeptEmploymentsInput
    company: OrganizationCreateNestedOneWithoutCompEmploymentsInput
    position: PositionCreateNestedOneWithoutEmploymentsInput
    roles?: EmploymentRoleCreateNestedManyWithoutEmploymentInput
  }

  export type EmploymentUncheckedCreateInput = {
    id?: number
    userId: number
    posId: number
    deptId: number
    compId: number
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    roles?: EmploymentRoleUncheckedCreateNestedManyWithoutEmploymentInput
  }

  export type EmploymentUpdateInput = {
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    user?: UserUpdateOneRequiredWithoutEmploymentsNestedInput
    deptartment?: OrganizationUpdateOneRequiredWithoutDeptEmploymentsNestedInput
    company?: OrganizationUpdateOneRequiredWithoutCompEmploymentsNestedInput
    position?: PositionUpdateOneRequiredWithoutEmploymentsNestedInput
    roles?: EmploymentRoleUpdateManyWithoutEmploymentNestedInput
  }

  export type EmploymentUncheckedUpdateInput = {
    id?: IntFieldUpdateOperationsInput | number
    userId?: IntFieldUpdateOperationsInput | number
    posId?: IntFieldUpdateOperationsInput | number
    deptId?: IntFieldUpdateOperationsInput | number
    compId?: IntFieldUpdateOperationsInput | number
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    roles?: EmploymentRoleUncheckedUpdateManyWithoutEmploymentNestedInput
  }

  export type EmploymentCreateManyInput = {
    id?: number
    userId: number
    posId: number
    deptId: number
    compId: number
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
  }

  export type EmploymentUpdateManyMutationInput = {
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type EmploymentUncheckedUpdateManyInput = {
    id?: IntFieldUpdateOperationsInput | number
    userId?: IntFieldUpdateOperationsInput | number
    posId?: IntFieldUpdateOperationsInput | number
    deptId?: IntFieldUpdateOperationsInput | number
    compId?: IntFieldUpdateOperationsInput | number
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ClientCreateInput = {
    clientCode: string
    clientName: string
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    role?: RoleCreateNestedManyWithoutClientInput
  }

  export type ClientUncheckedCreateInput = {
    id?: number
    clientCode: string
    clientName: string
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    role?: RoleUncheckedCreateNestedManyWithoutClientInput
  }

  export type ClientUpdateInput = {
    clientCode?: StringFieldUpdateOperationsInput | string
    clientName?: StringFieldUpdateOperationsInput | string
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    role?: RoleUpdateManyWithoutClientNestedInput
  }

  export type ClientUncheckedUpdateInput = {
    id?: IntFieldUpdateOperationsInput | number
    clientCode?: StringFieldUpdateOperationsInput | string
    clientName?: StringFieldUpdateOperationsInput | string
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    role?: RoleUncheckedUpdateManyWithoutClientNestedInput
  }

  export type ClientCreateManyInput = {
    id?: number
    clientCode: string
    clientName: string
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
  }

  export type ClientUpdateManyMutationInput = {
    clientCode?: StringFieldUpdateOperationsInput | string
    clientName?: StringFieldUpdateOperationsInput | string
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ClientUncheckedUpdateManyInput = {
    id?: IntFieldUpdateOperationsInput | number
    clientCode?: StringFieldUpdateOperationsInput | string
    clientName?: StringFieldUpdateOperationsInput | string
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type RoleCreateInput = {
    roleCode: string
    roleName: string
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    client: ClientCreateNestedOneWithoutRoleInput
    positions?: PositionRoleCreateNestedManyWithoutRoleInput
    organizations?: OrganizationRoleCreateNestedManyWithoutRoleInput
    employments?: EmploymentRoleCreateNestedManyWithoutRoleInput
    privileges?: RolePrivilegeCreateNestedManyWithoutRoleInput
  }

  export type RoleUncheckedCreateInput = {
    id?: number
    roleCode: string
    roleName: string
    clientId: number
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    positions?: PositionRoleUncheckedCreateNestedManyWithoutRoleInput
    organizations?: OrganizationRoleUncheckedCreateNestedManyWithoutRoleInput
    employments?: EmploymentRoleUncheckedCreateNestedManyWithoutRoleInput
    privileges?: RolePrivilegeUncheckedCreateNestedManyWithoutRoleInput
  }

  export type RoleUpdateInput = {
    roleCode?: StringFieldUpdateOperationsInput | string
    roleName?: StringFieldUpdateOperationsInput | string
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    client?: ClientUpdateOneRequiredWithoutRoleNestedInput
    positions?: PositionRoleUpdateManyWithoutRoleNestedInput
    organizations?: OrganizationRoleUpdateManyWithoutRoleNestedInput
    employments?: EmploymentRoleUpdateManyWithoutRoleNestedInput
    privileges?: RolePrivilegeUpdateManyWithoutRoleNestedInput
  }

  export type RoleUncheckedUpdateInput = {
    id?: IntFieldUpdateOperationsInput | number
    roleCode?: StringFieldUpdateOperationsInput | string
    roleName?: StringFieldUpdateOperationsInput | string
    clientId?: IntFieldUpdateOperationsInput | number
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    positions?: PositionRoleUncheckedUpdateManyWithoutRoleNestedInput
    organizations?: OrganizationRoleUncheckedUpdateManyWithoutRoleNestedInput
    employments?: EmploymentRoleUncheckedUpdateManyWithoutRoleNestedInput
    privileges?: RolePrivilegeUncheckedUpdateManyWithoutRoleNestedInput
  }

  export type RoleCreateManyInput = {
    id?: number
    roleCode: string
    roleName: string
    clientId: number
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
  }

  export type RoleUpdateManyMutationInput = {
    roleCode?: StringFieldUpdateOperationsInput | string
    roleName?: StringFieldUpdateOperationsInput | string
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type RoleUncheckedUpdateManyInput = {
    id?: IntFieldUpdateOperationsInput | number
    roleCode?: StringFieldUpdateOperationsInput | string
    roleName?: StringFieldUpdateOperationsInput | string
    clientId?: IntFieldUpdateOperationsInput | number
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type PositionRoleCreateInput = {
    position: PositionCreateNestedOneWithoutRolesInput
    role: RoleCreateNestedOneWithoutPositionsInput
  }

  export type PositionRoleUncheckedCreateInput = {
    positionId: number
    roleId: number
  }

  export type PositionRoleUpdateInput = {
    position?: PositionUpdateOneRequiredWithoutRolesNestedInput
    role?: RoleUpdateOneRequiredWithoutPositionsNestedInput
  }

  export type PositionRoleUncheckedUpdateInput = {
    positionId?: IntFieldUpdateOperationsInput | number
    roleId?: IntFieldUpdateOperationsInput | number
  }

  export type PositionRoleCreateManyInput = {
    positionId: number
    roleId: number
  }

  export type PositionRoleUpdateManyMutationInput = {

  }

  export type PositionRoleUncheckedUpdateManyInput = {
    positionId?: IntFieldUpdateOperationsInput | number
    roleId?: IntFieldUpdateOperationsInput | number
  }

  export type EmploymentRoleCreateInput = {
    employment: EmploymentCreateNestedOneWithoutRolesInput
    role: RoleCreateNestedOneWithoutEmploymentsInput
  }

  export type EmploymentRoleUncheckedCreateInput = {
    employmentId: number
    roleId: number
  }

  export type EmploymentRoleUpdateInput = {
    employment?: EmploymentUpdateOneRequiredWithoutRolesNestedInput
    role?: RoleUpdateOneRequiredWithoutEmploymentsNestedInput
  }

  export type EmploymentRoleUncheckedUpdateInput = {
    employmentId?: IntFieldUpdateOperationsInput | number
    roleId?: IntFieldUpdateOperationsInput | number
  }

  export type EmploymentRoleCreateManyInput = {
    employmentId: number
    roleId: number
  }

  export type EmploymentRoleUpdateManyMutationInput = {

  }

  export type EmploymentRoleUncheckedUpdateManyInput = {
    employmentId?: IntFieldUpdateOperationsInput | number
    roleId?: IntFieldUpdateOperationsInput | number
  }

  export type OrganizationRoleCreateInput = {
    organization: OrganizationCreateNestedOneWithoutRolesInput
    role: RoleCreateNestedOneWithoutOrganizationsInput
  }

  export type OrganizationRoleUncheckedCreateInput = {
    organizationId: number
    roleId: number
  }

  export type OrganizationRoleUpdateInput = {
    organization?: OrganizationUpdateOneRequiredWithoutRolesNestedInput
    role?: RoleUpdateOneRequiredWithoutOrganizationsNestedInput
  }

  export type OrganizationRoleUncheckedUpdateInput = {
    organizationId?: IntFieldUpdateOperationsInput | number
    roleId?: IntFieldUpdateOperationsInput | number
  }

  export type OrganizationRoleCreateManyInput = {
    organizationId: number
    roleId: number
  }

  export type OrganizationRoleUpdateManyMutationInput = {

  }

  export type OrganizationRoleUncheckedUpdateManyInput = {
    organizationId?: IntFieldUpdateOperationsInput | number
    roleId?: IntFieldUpdateOperationsInput | number
  }

  export type AuthObjectCreateInput = {
    objectCode: string
    objectName: string
    objectType: string
    path?: string | null
    authFields?: NullableJsonNullValueInput | InputJsonValue
    privileges?: PrivilegeCreateNestedManyWithoutObjectInput
  }

  export type AuthObjectUncheckedCreateInput = {
    id?: number
    objectCode: string
    objectName: string
    objectType: string
    path?: string | null
    authFields?: NullableJsonNullValueInput | InputJsonValue
    privileges?: PrivilegeUncheckedCreateNestedManyWithoutObjectInput
  }

  export type AuthObjectUpdateInput = {
    objectCode?: StringFieldUpdateOperationsInput | string
    objectName?: StringFieldUpdateOperationsInput | string
    objectType?: StringFieldUpdateOperationsInput | string
    path?: NullableStringFieldUpdateOperationsInput | string | null
    authFields?: NullableJsonNullValueInput | InputJsonValue
    privileges?: PrivilegeUpdateManyWithoutObjectNestedInput
  }

  export type AuthObjectUncheckedUpdateInput = {
    id?: IntFieldUpdateOperationsInput | number
    objectCode?: StringFieldUpdateOperationsInput | string
    objectName?: StringFieldUpdateOperationsInput | string
    objectType?: StringFieldUpdateOperationsInput | string
    path?: NullableStringFieldUpdateOperationsInput | string | null
    authFields?: NullableJsonNullValueInput | InputJsonValue
    privileges?: PrivilegeUncheckedUpdateManyWithoutObjectNestedInput
  }

  export type AuthObjectCreateManyInput = {
    id?: number
    objectCode: string
    objectName: string
    objectType: string
    path?: string | null
    authFields?: NullableJsonNullValueInput | InputJsonValue
  }

  export type AuthObjectUpdateManyMutationInput = {
    objectCode?: StringFieldUpdateOperationsInput | string
    objectName?: StringFieldUpdateOperationsInput | string
    objectType?: StringFieldUpdateOperationsInput | string
    path?: NullableStringFieldUpdateOperationsInput | string | null
    authFields?: NullableJsonNullValueInput | InputJsonValue
  }

  export type AuthObjectUncheckedUpdateManyInput = {
    id?: IntFieldUpdateOperationsInput | number
    objectCode?: StringFieldUpdateOperationsInput | string
    objectName?: StringFieldUpdateOperationsInput | string
    objectType?: StringFieldUpdateOperationsInput | string
    path?: NullableStringFieldUpdateOperationsInput | string | null
    authFields?: NullableJsonNullValueInput | InputJsonValue
  }

  export type PrivilegeCreateInput = {
    privilegeCode: string
    privilegeName: string
    fieldValues?: NullableJsonNullValueInput | InputJsonValue
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    roles?: RolePrivilegeCreateNestedManyWithoutPrivilegeInput
    object: AuthObjectCreateNestedOneWithoutPrivilegesInput
  }

  export type PrivilegeUncheckedCreateInput = {
    id?: number
    privilegeCode: string
    privilegeName: string
    objectId: number
    fieldValues?: NullableJsonNullValueInput | InputJsonValue
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    roles?: RolePrivilegeUncheckedCreateNestedManyWithoutPrivilegeInput
  }

  export type PrivilegeUpdateInput = {
    privilegeCode?: StringFieldUpdateOperationsInput | string
    privilegeName?: StringFieldUpdateOperationsInput | string
    fieldValues?: NullableJsonNullValueInput | InputJsonValue
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    roles?: RolePrivilegeUpdateManyWithoutPrivilegeNestedInput
    object?: AuthObjectUpdateOneRequiredWithoutPrivilegesNestedInput
  }

  export type PrivilegeUncheckedUpdateInput = {
    id?: IntFieldUpdateOperationsInput | number
    privilegeCode?: StringFieldUpdateOperationsInput | string
    privilegeName?: StringFieldUpdateOperationsInput | string
    objectId?: IntFieldUpdateOperationsInput | number
    fieldValues?: NullableJsonNullValueInput | InputJsonValue
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    roles?: RolePrivilegeUncheckedUpdateManyWithoutPrivilegeNestedInput
  }

  export type PrivilegeCreateManyInput = {
    id?: number
    privilegeCode: string
    privilegeName: string
    objectId: number
    fieldValues?: NullableJsonNullValueInput | InputJsonValue
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
  }

  export type PrivilegeUpdateManyMutationInput = {
    privilegeCode?: StringFieldUpdateOperationsInput | string
    privilegeName?: StringFieldUpdateOperationsInput | string
    fieldValues?: NullableJsonNullValueInput | InputJsonValue
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type PrivilegeUncheckedUpdateManyInput = {
    id?: IntFieldUpdateOperationsInput | number
    privilegeCode?: StringFieldUpdateOperationsInput | string
    privilegeName?: StringFieldUpdateOperationsInput | string
    objectId?: IntFieldUpdateOperationsInput | number
    fieldValues?: NullableJsonNullValueInput | InputJsonValue
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type PrivilegeDelegationCreateInput = {
    startTime: Date | string
    endTime: Date | string
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    delegatorUser: UserCreateNestedOneWithoutDelegationToInput
    delegateeUser: UserCreateNestedOneWithoutDelegationFromInput
    delegationDetails?: DelegationDetailCreateNestedManyWithoutDelegationInput
  }

  export type PrivilegeDelegationUncheckedCreateInput = {
    id?: number
    delegatorUserId: number
    delegateeUserId: number
    startTime: Date | string
    endTime: Date | string
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    delegationDetails?: DelegationDetailUncheckedCreateNestedManyWithoutDelegationInput
  }

  export type PrivilegeDelegationUpdateInput = {
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: DateTimeFieldUpdateOperationsInput | Date | string
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    delegatorUser?: UserUpdateOneRequiredWithoutDelegationToNestedInput
    delegateeUser?: UserUpdateOneRequiredWithoutDelegationFromNestedInput
    delegationDetails?: DelegationDetailUpdateManyWithoutDelegationNestedInput
  }

  export type PrivilegeDelegationUncheckedUpdateInput = {
    id?: IntFieldUpdateOperationsInput | number
    delegatorUserId?: IntFieldUpdateOperationsInput | number
    delegateeUserId?: IntFieldUpdateOperationsInput | number
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: DateTimeFieldUpdateOperationsInput | Date | string
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    delegationDetails?: DelegationDetailUncheckedUpdateManyWithoutDelegationNestedInput
  }

  export type PrivilegeDelegationCreateManyInput = {
    id?: number
    delegatorUserId: number
    delegateeUserId: number
    startTime: Date | string
    endTime: Date | string
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
  }

  export type PrivilegeDelegationUpdateManyMutationInput = {
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: DateTimeFieldUpdateOperationsInput | Date | string
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type PrivilegeDelegationUncheckedUpdateManyInput = {
    id?: IntFieldUpdateOperationsInput | number
    delegatorUserId?: IntFieldUpdateOperationsInput | number
    delegateeUserId?: IntFieldUpdateOperationsInput | number
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: DateTimeFieldUpdateOperationsInput | Date | string
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type DelegationDetailCreateInput = {
    resourceCode: string
    delegation: PrivilegeDelegationCreateNestedOneWithoutDelegationDetailsInput
  }

  export type DelegationDetailUncheckedCreateInput = {
    delegationId: number
    resourceCode: string
  }

  export type DelegationDetailUpdateInput = {
    resourceCode?: StringFieldUpdateOperationsInput | string
    delegation?: PrivilegeDelegationUpdateOneRequiredWithoutDelegationDetailsNestedInput
  }

  export type DelegationDetailUncheckedUpdateInput = {
    delegationId?: IntFieldUpdateOperationsInput | number
    resourceCode?: StringFieldUpdateOperationsInput | string
  }

  export type DelegationDetailCreateManyInput = {
    delegationId: number
    resourceCode: string
  }

  export type DelegationDetailUpdateManyMutationInput = {
    resourceCode?: StringFieldUpdateOperationsInput | string
  }

  export type DelegationDetailUncheckedUpdateManyInput = {
    delegationId?: IntFieldUpdateOperationsInput | number
    resourceCode?: StringFieldUpdateOperationsInput | string
  }

  export type RolePrivilegeCreateInput = {
    role: RoleCreateNestedOneWithoutPrivilegesInput
    privilege: PrivilegeCreateNestedOneWithoutRolesInput
  }

  export type RolePrivilegeUncheckedCreateInput = {
    roleId: number
    privilegeId: number
  }

  export type RolePrivilegeUpdateInput = {
    role?: RoleUpdateOneRequiredWithoutPrivilegesNestedInput
    privilege?: PrivilegeUpdateOneRequiredWithoutRolesNestedInput
  }

  export type RolePrivilegeUncheckedUpdateInput = {
    roleId?: IntFieldUpdateOperationsInput | number
    privilegeId?: IntFieldUpdateOperationsInput | number
  }

  export type RolePrivilegeCreateManyInput = {
    roleId: number
    privilegeId: number
  }

  export type RolePrivilegeUpdateManyMutationInput = {

  }

  export type RolePrivilegeUncheckedUpdateManyInput = {
    roleId?: IntFieldUpdateOperationsInput | number
    privilegeId?: IntFieldUpdateOperationsInput | number
  }

  export type IntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type StringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[]
    notIn?: string[]
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    search?: string
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type StringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | null
    notIn?: string[] | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    search?: string
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type BoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }

  export type DateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[]
    notIn?: Date[] | string[]
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type EmploymentListRelationFilter = {
    every?: EmploymentWhereInput
    some?: EmploymentWhereInput
    none?: EmploymentWhereInput
  }

  export type PrivilegeDelegationListRelationFilter = {
    every?: PrivilegeDelegationWhereInput
    some?: PrivilegeDelegationWhereInput
    none?: PrivilegeDelegationWhereInput
  }

  export type SortOrderInput = {
    sort: SortOrder
    nulls?: NullsOrder
  }

  export type EmploymentOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type PrivilegeDelegationOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type UserOrderByRelevanceInput = {
    fields: UserOrderByRelevanceFieldEnum | UserOrderByRelevanceFieldEnum[]
    sort: SortOrder
    search: string
  }

  export type UserCountOrderByAggregateInput = {
    id?: SortOrder
    username?: SortOrder
    name?: SortOrder
    password?: SortOrder
    mobilePhone?: SortOrder
    userType?: SortOrder
    status?: SortOrder
    isDelete?: SortOrder
    createTime?: SortOrder
    updateTime?: SortOrder
  }

  export type UserAvgOrderByAggregateInput = {
    id?: SortOrder
    status?: SortOrder
  }

  export type UserMaxOrderByAggregateInput = {
    id?: SortOrder
    username?: SortOrder
    name?: SortOrder
    password?: SortOrder
    mobilePhone?: SortOrder
    userType?: SortOrder
    status?: SortOrder
    isDelete?: SortOrder
    createTime?: SortOrder
    updateTime?: SortOrder
  }

  export type UserMinOrderByAggregateInput = {
    id?: SortOrder
    username?: SortOrder
    name?: SortOrder
    password?: SortOrder
    mobilePhone?: SortOrder
    userType?: SortOrder
    status?: SortOrder
    isDelete?: SortOrder
    createTime?: SortOrder
    updateTime?: SortOrder
  }

  export type UserSumOrderByAggregateInput = {
    id?: SortOrder
    status?: SortOrder
  }

  export type IntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type StringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[]
    notIn?: string[]
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    search?: string
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type StringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | null
    notIn?: string[] | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    search?: string
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type BoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }

  export type DateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[]
    notIn?: Date[] | string[]
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type OrganizationRoleListRelationFilter = {
    every?: OrganizationRoleWhereInput
    some?: OrganizationRoleWhereInput
    none?: OrganizationRoleWhereInput
  }

  export type OrganizationRoleOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type OrganizationOrderByRelevanceInput = {
    fields: OrganizationOrderByRelevanceFieldEnum | OrganizationOrderByRelevanceFieldEnum[]
    sort: SortOrder
    search: string
  }

  export type OrganizationCountOrderByAggregateInput = {
    id?: SortOrder
    orgCode?: SortOrder
    orgName?: SortOrder
    parentId?: SortOrder
    businessParentId?: SortOrder
    level?: SortOrder
    orgType?: SortOrder
    orderNum?: SortOrder
    isVirtual?: SortOrder
    isEntity?: SortOrder
    status?: SortOrder
    isDelete?: SortOrder
    createTime?: SortOrder
    updateTime?: SortOrder
  }

  export type OrganizationAvgOrderByAggregateInput = {
    id?: SortOrder
    parentId?: SortOrder
    businessParentId?: SortOrder
    level?: SortOrder
    orderNum?: SortOrder
  }

  export type OrganizationMaxOrderByAggregateInput = {
    id?: SortOrder
    orgCode?: SortOrder
    orgName?: SortOrder
    parentId?: SortOrder
    businessParentId?: SortOrder
    level?: SortOrder
    orgType?: SortOrder
    orderNum?: SortOrder
    isVirtual?: SortOrder
    isEntity?: SortOrder
    status?: SortOrder
    isDelete?: SortOrder
    createTime?: SortOrder
    updateTime?: SortOrder
  }

  export type OrganizationMinOrderByAggregateInput = {
    id?: SortOrder
    orgCode?: SortOrder
    orgName?: SortOrder
    parentId?: SortOrder
    businessParentId?: SortOrder
    level?: SortOrder
    orgType?: SortOrder
    orderNum?: SortOrder
    isVirtual?: SortOrder
    isEntity?: SortOrder
    status?: SortOrder
    isDelete?: SortOrder
    createTime?: SortOrder
    updateTime?: SortOrder
  }

  export type OrganizationSumOrderByAggregateInput = {
    id?: SortOrder
    parentId?: SortOrder
    businessParentId?: SortOrder
    level?: SortOrder
    orderNum?: SortOrder
  }

  export type PositionRoleListRelationFilter = {
    every?: PositionRoleWhereInput
    some?: PositionRoleWhereInput
    none?: PositionRoleWhereInput
  }

  export type PositionRoleOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type PositionOrderByRelevanceInput = {
    fields: PositionOrderByRelevanceFieldEnum | PositionOrderByRelevanceFieldEnum[]
    sort: SortOrder
    search: string
  }

  export type PositionCountOrderByAggregateInput = {
    id?: SortOrder
    posCode?: SortOrder
    posName?: SortOrder
    status?: SortOrder
    description?: SortOrder
    isDelete?: SortOrder
    createTime?: SortOrder
    updateTime?: SortOrder
  }

  export type PositionAvgOrderByAggregateInput = {
    id?: SortOrder
    status?: SortOrder
  }

  export type PositionMaxOrderByAggregateInput = {
    id?: SortOrder
    posCode?: SortOrder
    posName?: SortOrder
    status?: SortOrder
    description?: SortOrder
    isDelete?: SortOrder
    createTime?: SortOrder
    updateTime?: SortOrder
  }

  export type PositionMinOrderByAggregateInput = {
    id?: SortOrder
    posCode?: SortOrder
    posName?: SortOrder
    status?: SortOrder
    description?: SortOrder
    isDelete?: SortOrder
    createTime?: SortOrder
    updateTime?: SortOrder
  }

  export type PositionSumOrderByAggregateInput = {
    id?: SortOrder
    status?: SortOrder
  }

  export type UserScalarRelationFilter = {
    is?: UserWhereInput
    isNot?: UserWhereInput
  }

  export type OrganizationScalarRelationFilter = {
    is?: OrganizationWhereInput
    isNot?: OrganizationWhereInput
  }

  export type PositionScalarRelationFilter = {
    is?: PositionWhereInput
    isNot?: PositionWhereInput
  }

  export type EmploymentRoleListRelationFilter = {
    every?: EmploymentRoleWhereInput
    some?: EmploymentRoleWhereInput
    none?: EmploymentRoleWhereInput
  }

  export type EmploymentRoleOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type EmploymentOrderByRelevanceInput = {
    fields: EmploymentOrderByRelevanceFieldEnum | EmploymentOrderByRelevanceFieldEnum[]
    sort: SortOrder
    search: string
  }

  export type EmploymentCountOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
    posId?: SortOrder
    deptId?: SortOrder
    compId?: SortOrder
    status?: SortOrder
    description?: SortOrder
    isDelete?: SortOrder
    createTime?: SortOrder
    updateTime?: SortOrder
  }

  export type EmploymentAvgOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
    posId?: SortOrder
    deptId?: SortOrder
    compId?: SortOrder
    status?: SortOrder
  }

  export type EmploymentMaxOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
    posId?: SortOrder
    deptId?: SortOrder
    compId?: SortOrder
    status?: SortOrder
    description?: SortOrder
    isDelete?: SortOrder
    createTime?: SortOrder
    updateTime?: SortOrder
  }

  export type EmploymentMinOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
    posId?: SortOrder
    deptId?: SortOrder
    compId?: SortOrder
    status?: SortOrder
    description?: SortOrder
    isDelete?: SortOrder
    createTime?: SortOrder
    updateTime?: SortOrder
  }

  export type EmploymentSumOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
    posId?: SortOrder
    deptId?: SortOrder
    compId?: SortOrder
    status?: SortOrder
  }

  export type RoleListRelationFilter = {
    every?: RoleWhereInput
    some?: RoleWhereInput
    none?: RoleWhereInput
  }

  export type RoleOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type ClientOrderByRelevanceInput = {
    fields: ClientOrderByRelevanceFieldEnum | ClientOrderByRelevanceFieldEnum[]
    sort: SortOrder
    search: string
  }

  export type ClientCountOrderByAggregateInput = {
    id?: SortOrder
    clientCode?: SortOrder
    clientName?: SortOrder
    status?: SortOrder
    description?: SortOrder
    isDelete?: SortOrder
    createTime?: SortOrder
    updateTime?: SortOrder
  }

  export type ClientAvgOrderByAggregateInput = {
    id?: SortOrder
    status?: SortOrder
  }

  export type ClientMaxOrderByAggregateInput = {
    id?: SortOrder
    clientCode?: SortOrder
    clientName?: SortOrder
    status?: SortOrder
    description?: SortOrder
    isDelete?: SortOrder
    createTime?: SortOrder
    updateTime?: SortOrder
  }

  export type ClientMinOrderByAggregateInput = {
    id?: SortOrder
    clientCode?: SortOrder
    clientName?: SortOrder
    status?: SortOrder
    description?: SortOrder
    isDelete?: SortOrder
    createTime?: SortOrder
    updateTime?: SortOrder
  }

  export type ClientSumOrderByAggregateInput = {
    id?: SortOrder
    status?: SortOrder
  }

  export type ClientScalarRelationFilter = {
    is?: ClientWhereInput
    isNot?: ClientWhereInput
  }

  export type RolePrivilegeListRelationFilter = {
    every?: RolePrivilegeWhereInput
    some?: RolePrivilegeWhereInput
    none?: RolePrivilegeWhereInput
  }

  export type RolePrivilegeOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type RoleOrderByRelevanceInput = {
    fields: RoleOrderByRelevanceFieldEnum | RoleOrderByRelevanceFieldEnum[]
    sort: SortOrder
    search: string
  }

  export type RoleCountOrderByAggregateInput = {
    id?: SortOrder
    roleCode?: SortOrder
    roleName?: SortOrder
    clientId?: SortOrder
    status?: SortOrder
    description?: SortOrder
    isDelete?: SortOrder
    createTime?: SortOrder
    updateTime?: SortOrder
  }

  export type RoleAvgOrderByAggregateInput = {
    id?: SortOrder
    clientId?: SortOrder
    status?: SortOrder
  }

  export type RoleMaxOrderByAggregateInput = {
    id?: SortOrder
    roleCode?: SortOrder
    roleName?: SortOrder
    clientId?: SortOrder
    status?: SortOrder
    description?: SortOrder
    isDelete?: SortOrder
    createTime?: SortOrder
    updateTime?: SortOrder
  }

  export type RoleMinOrderByAggregateInput = {
    id?: SortOrder
    roleCode?: SortOrder
    roleName?: SortOrder
    clientId?: SortOrder
    status?: SortOrder
    description?: SortOrder
    isDelete?: SortOrder
    createTime?: SortOrder
    updateTime?: SortOrder
  }

  export type RoleSumOrderByAggregateInput = {
    id?: SortOrder
    clientId?: SortOrder
    status?: SortOrder
  }

  export type RoleScalarRelationFilter = {
    is?: RoleWhereInput
    isNot?: RoleWhereInput
  }

  export type PositionRolePositionIdRoleIdCompoundUniqueInput = {
    positionId: number
    roleId: number
  }

  export type PositionRoleCountOrderByAggregateInput = {
    positionId?: SortOrder
    roleId?: SortOrder
  }

  export type PositionRoleAvgOrderByAggregateInput = {
    positionId?: SortOrder
    roleId?: SortOrder
  }

  export type PositionRoleMaxOrderByAggregateInput = {
    positionId?: SortOrder
    roleId?: SortOrder
  }

  export type PositionRoleMinOrderByAggregateInput = {
    positionId?: SortOrder
    roleId?: SortOrder
  }

  export type PositionRoleSumOrderByAggregateInput = {
    positionId?: SortOrder
    roleId?: SortOrder
  }

  export type EmploymentScalarRelationFilter = {
    is?: EmploymentWhereInput
    isNot?: EmploymentWhereInput
  }

  export type EmploymentRoleEmploymentIdRoleIdCompoundUniqueInput = {
    employmentId: number
    roleId: number
  }

  export type EmploymentRoleCountOrderByAggregateInput = {
    employmentId?: SortOrder
    roleId?: SortOrder
  }

  export type EmploymentRoleAvgOrderByAggregateInput = {
    employmentId?: SortOrder
    roleId?: SortOrder
  }

  export type EmploymentRoleMaxOrderByAggregateInput = {
    employmentId?: SortOrder
    roleId?: SortOrder
  }

  export type EmploymentRoleMinOrderByAggregateInput = {
    employmentId?: SortOrder
    roleId?: SortOrder
  }

  export type EmploymentRoleSumOrderByAggregateInput = {
    employmentId?: SortOrder
    roleId?: SortOrder
  }

  export type OrganizationRoleOrganizationIdRoleIdCompoundUniqueInput = {
    organizationId: number
    roleId: number
  }

  export type OrganizationRoleCountOrderByAggregateInput = {
    organizationId?: SortOrder
    roleId?: SortOrder
  }

  export type OrganizationRoleAvgOrderByAggregateInput = {
    organizationId?: SortOrder
    roleId?: SortOrder
  }

  export type OrganizationRoleMaxOrderByAggregateInput = {
    organizationId?: SortOrder
    roleId?: SortOrder
  }

  export type OrganizationRoleMinOrderByAggregateInput = {
    organizationId?: SortOrder
    roleId?: SortOrder
  }

  export type OrganizationRoleSumOrderByAggregateInput = {
    organizationId?: SortOrder
    roleId?: SortOrder
  }
  export type JsonNullableFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<JsonNullableFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonNullableFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonNullableFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonNullableFilterBase<$PrismaModel>>, 'path'>>

  export type JsonNullableFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue
    lte?: InputJsonValue
    gt?: InputJsonValue
    gte?: InputJsonValue
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type PrivilegeListRelationFilter = {
    every?: PrivilegeWhereInput
    some?: PrivilegeWhereInput
    none?: PrivilegeWhereInput
  }

  export type PrivilegeOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type AuthObjectOrderByRelevanceInput = {
    fields: AuthObjectOrderByRelevanceFieldEnum | AuthObjectOrderByRelevanceFieldEnum[]
    sort: SortOrder
    search: string
  }

  export type AuthObjectCountOrderByAggregateInput = {
    id?: SortOrder
    objectCode?: SortOrder
    objectName?: SortOrder
    objectType?: SortOrder
    path?: SortOrder
    authFields?: SortOrder
  }

  export type AuthObjectAvgOrderByAggregateInput = {
    id?: SortOrder
  }

  export type AuthObjectMaxOrderByAggregateInput = {
    id?: SortOrder
    objectCode?: SortOrder
    objectName?: SortOrder
    objectType?: SortOrder
    path?: SortOrder
  }

  export type AuthObjectMinOrderByAggregateInput = {
    id?: SortOrder
    objectCode?: SortOrder
    objectName?: SortOrder
    objectType?: SortOrder
    path?: SortOrder
  }

  export type AuthObjectSumOrderByAggregateInput = {
    id?: SortOrder
  }
  export type JsonNullableWithAggregatesFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>, 'path'>>

  export type JsonNullableWithAggregatesFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue
    lte?: InputJsonValue
    gt?: InputJsonValue
    gte?: InputJsonValue
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedJsonNullableFilter<$PrismaModel>
    _max?: NestedJsonNullableFilter<$PrismaModel>
  }

  export type AuthObjectScalarRelationFilter = {
    is?: AuthObjectWhereInput
    isNot?: AuthObjectWhereInput
  }

  export type PrivilegeOrderByRelevanceInput = {
    fields: PrivilegeOrderByRelevanceFieldEnum | PrivilegeOrderByRelevanceFieldEnum[]
    sort: SortOrder
    search: string
  }

  export type PrivilegeCountOrderByAggregateInput = {
    id?: SortOrder
    privilegeCode?: SortOrder
    privilegeName?: SortOrder
    objectId?: SortOrder
    fieldValues?: SortOrder
    status?: SortOrder
    description?: SortOrder
    isDelete?: SortOrder
    createTime?: SortOrder
    updateTime?: SortOrder
  }

  export type PrivilegeAvgOrderByAggregateInput = {
    id?: SortOrder
    objectId?: SortOrder
    status?: SortOrder
  }

  export type PrivilegeMaxOrderByAggregateInput = {
    id?: SortOrder
    privilegeCode?: SortOrder
    privilegeName?: SortOrder
    objectId?: SortOrder
    status?: SortOrder
    description?: SortOrder
    isDelete?: SortOrder
    createTime?: SortOrder
    updateTime?: SortOrder
  }

  export type PrivilegeMinOrderByAggregateInput = {
    id?: SortOrder
    privilegeCode?: SortOrder
    privilegeName?: SortOrder
    objectId?: SortOrder
    status?: SortOrder
    description?: SortOrder
    isDelete?: SortOrder
    createTime?: SortOrder
    updateTime?: SortOrder
  }

  export type PrivilegeSumOrderByAggregateInput = {
    id?: SortOrder
    objectId?: SortOrder
    status?: SortOrder
  }

  export type DelegationDetailListRelationFilter = {
    every?: DelegationDetailWhereInput
    some?: DelegationDetailWhereInput
    none?: DelegationDetailWhereInput
  }

  export type DelegationDetailOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type PrivilegeDelegationOrderByRelevanceInput = {
    fields: PrivilegeDelegationOrderByRelevanceFieldEnum | PrivilegeDelegationOrderByRelevanceFieldEnum[]
    sort: SortOrder
    search: string
  }

  export type PrivilegeDelegationCountOrderByAggregateInput = {
    id?: SortOrder
    delegatorUserId?: SortOrder
    delegateeUserId?: SortOrder
    startTime?: SortOrder
    endTime?: SortOrder
    status?: SortOrder
    description?: SortOrder
    isDelete?: SortOrder
    createTime?: SortOrder
    updateTime?: SortOrder
  }

  export type PrivilegeDelegationAvgOrderByAggregateInput = {
    id?: SortOrder
    delegatorUserId?: SortOrder
    delegateeUserId?: SortOrder
    status?: SortOrder
  }

  export type PrivilegeDelegationMaxOrderByAggregateInput = {
    id?: SortOrder
    delegatorUserId?: SortOrder
    delegateeUserId?: SortOrder
    startTime?: SortOrder
    endTime?: SortOrder
    status?: SortOrder
    description?: SortOrder
    isDelete?: SortOrder
    createTime?: SortOrder
    updateTime?: SortOrder
  }

  export type PrivilegeDelegationMinOrderByAggregateInput = {
    id?: SortOrder
    delegatorUserId?: SortOrder
    delegateeUserId?: SortOrder
    startTime?: SortOrder
    endTime?: SortOrder
    status?: SortOrder
    description?: SortOrder
    isDelete?: SortOrder
    createTime?: SortOrder
    updateTime?: SortOrder
  }

  export type PrivilegeDelegationSumOrderByAggregateInput = {
    id?: SortOrder
    delegatorUserId?: SortOrder
    delegateeUserId?: SortOrder
    status?: SortOrder
  }

  export type PrivilegeDelegationScalarRelationFilter = {
    is?: PrivilegeDelegationWhereInput
    isNot?: PrivilegeDelegationWhereInput
  }

  export type DelegationDetailOrderByRelevanceInput = {
    fields: DelegationDetailOrderByRelevanceFieldEnum | DelegationDetailOrderByRelevanceFieldEnum[]
    sort: SortOrder
    search: string
  }

  export type DelegationDetailDelegationIdResourceCodeCompoundUniqueInput = {
    delegationId: number
    resourceCode: string
  }

  export type DelegationDetailCountOrderByAggregateInput = {
    delegationId?: SortOrder
    resourceCode?: SortOrder
  }

  export type DelegationDetailAvgOrderByAggregateInput = {
    delegationId?: SortOrder
  }

  export type DelegationDetailMaxOrderByAggregateInput = {
    delegationId?: SortOrder
    resourceCode?: SortOrder
  }

  export type DelegationDetailMinOrderByAggregateInput = {
    delegationId?: SortOrder
    resourceCode?: SortOrder
  }

  export type DelegationDetailSumOrderByAggregateInput = {
    delegationId?: SortOrder
  }

  export type PrivilegeScalarRelationFilter = {
    is?: PrivilegeWhereInput
    isNot?: PrivilegeWhereInput
  }

  export type RolePrivilegeRoleIdPrivilegeIdCompoundUniqueInput = {
    roleId: number
    privilegeId: number
  }

  export type RolePrivilegeCountOrderByAggregateInput = {
    roleId?: SortOrder
    privilegeId?: SortOrder
  }

  export type RolePrivilegeAvgOrderByAggregateInput = {
    roleId?: SortOrder
    privilegeId?: SortOrder
  }

  export type RolePrivilegeMaxOrderByAggregateInput = {
    roleId?: SortOrder
    privilegeId?: SortOrder
  }

  export type RolePrivilegeMinOrderByAggregateInput = {
    roleId?: SortOrder
    privilegeId?: SortOrder
  }

  export type RolePrivilegeSumOrderByAggregateInput = {
    roleId?: SortOrder
    privilegeId?: SortOrder
  }

  export type EmploymentCreateNestedManyWithoutUserInput = {
    create?: XOR<EmploymentCreateWithoutUserInput, EmploymentUncheckedCreateWithoutUserInput> | EmploymentCreateWithoutUserInput[] | EmploymentUncheckedCreateWithoutUserInput[]
    connectOrCreate?: EmploymentCreateOrConnectWithoutUserInput | EmploymentCreateOrConnectWithoutUserInput[]
    createMany?: EmploymentCreateManyUserInputEnvelope
    connect?: EmploymentWhereUniqueInput | EmploymentWhereUniqueInput[]
  }

  export type PrivilegeDelegationCreateNestedManyWithoutDelegatorUserInput = {
    create?: XOR<PrivilegeDelegationCreateWithoutDelegatorUserInput, PrivilegeDelegationUncheckedCreateWithoutDelegatorUserInput> | PrivilegeDelegationCreateWithoutDelegatorUserInput[] | PrivilegeDelegationUncheckedCreateWithoutDelegatorUserInput[]
    connectOrCreate?: PrivilegeDelegationCreateOrConnectWithoutDelegatorUserInput | PrivilegeDelegationCreateOrConnectWithoutDelegatorUserInput[]
    createMany?: PrivilegeDelegationCreateManyDelegatorUserInputEnvelope
    connect?: PrivilegeDelegationWhereUniqueInput | PrivilegeDelegationWhereUniqueInput[]
  }

  export type PrivilegeDelegationCreateNestedManyWithoutDelegateeUserInput = {
    create?: XOR<PrivilegeDelegationCreateWithoutDelegateeUserInput, PrivilegeDelegationUncheckedCreateWithoutDelegateeUserInput> | PrivilegeDelegationCreateWithoutDelegateeUserInput[] | PrivilegeDelegationUncheckedCreateWithoutDelegateeUserInput[]
    connectOrCreate?: PrivilegeDelegationCreateOrConnectWithoutDelegateeUserInput | PrivilegeDelegationCreateOrConnectWithoutDelegateeUserInput[]
    createMany?: PrivilegeDelegationCreateManyDelegateeUserInputEnvelope
    connect?: PrivilegeDelegationWhereUniqueInput | PrivilegeDelegationWhereUniqueInput[]
  }

  export type EmploymentUncheckedCreateNestedManyWithoutUserInput = {
    create?: XOR<EmploymentCreateWithoutUserInput, EmploymentUncheckedCreateWithoutUserInput> | EmploymentCreateWithoutUserInput[] | EmploymentUncheckedCreateWithoutUserInput[]
    connectOrCreate?: EmploymentCreateOrConnectWithoutUserInput | EmploymentCreateOrConnectWithoutUserInput[]
    createMany?: EmploymentCreateManyUserInputEnvelope
    connect?: EmploymentWhereUniqueInput | EmploymentWhereUniqueInput[]
  }

  export type PrivilegeDelegationUncheckedCreateNestedManyWithoutDelegatorUserInput = {
    create?: XOR<PrivilegeDelegationCreateWithoutDelegatorUserInput, PrivilegeDelegationUncheckedCreateWithoutDelegatorUserInput> | PrivilegeDelegationCreateWithoutDelegatorUserInput[] | PrivilegeDelegationUncheckedCreateWithoutDelegatorUserInput[]
    connectOrCreate?: PrivilegeDelegationCreateOrConnectWithoutDelegatorUserInput | PrivilegeDelegationCreateOrConnectWithoutDelegatorUserInput[]
    createMany?: PrivilegeDelegationCreateManyDelegatorUserInputEnvelope
    connect?: PrivilegeDelegationWhereUniqueInput | PrivilegeDelegationWhereUniqueInput[]
  }

  export type PrivilegeDelegationUncheckedCreateNestedManyWithoutDelegateeUserInput = {
    create?: XOR<PrivilegeDelegationCreateWithoutDelegateeUserInput, PrivilegeDelegationUncheckedCreateWithoutDelegateeUserInput> | PrivilegeDelegationCreateWithoutDelegateeUserInput[] | PrivilegeDelegationUncheckedCreateWithoutDelegateeUserInput[]
    connectOrCreate?: PrivilegeDelegationCreateOrConnectWithoutDelegateeUserInput | PrivilegeDelegationCreateOrConnectWithoutDelegateeUserInput[]
    createMany?: PrivilegeDelegationCreateManyDelegateeUserInputEnvelope
    connect?: PrivilegeDelegationWhereUniqueInput | PrivilegeDelegationWhereUniqueInput[]
  }

  export type StringFieldUpdateOperationsInput = {
    set?: string
  }

  export type NullableStringFieldUpdateOperationsInput = {
    set?: string | null
  }

  export type IntFieldUpdateOperationsInput = {
    set?: number
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type BoolFieldUpdateOperationsInput = {
    set?: boolean
  }

  export type DateTimeFieldUpdateOperationsInput = {
    set?: Date | string
  }

  export type EmploymentUpdateManyWithoutUserNestedInput = {
    create?: XOR<EmploymentCreateWithoutUserInput, EmploymentUncheckedCreateWithoutUserInput> | EmploymentCreateWithoutUserInput[] | EmploymentUncheckedCreateWithoutUserInput[]
    connectOrCreate?: EmploymentCreateOrConnectWithoutUserInput | EmploymentCreateOrConnectWithoutUserInput[]
    upsert?: EmploymentUpsertWithWhereUniqueWithoutUserInput | EmploymentUpsertWithWhereUniqueWithoutUserInput[]
    createMany?: EmploymentCreateManyUserInputEnvelope
    set?: EmploymentWhereUniqueInput | EmploymentWhereUniqueInput[]
    disconnect?: EmploymentWhereUniqueInput | EmploymentWhereUniqueInput[]
    delete?: EmploymentWhereUniqueInput | EmploymentWhereUniqueInput[]
    connect?: EmploymentWhereUniqueInput | EmploymentWhereUniqueInput[]
    update?: EmploymentUpdateWithWhereUniqueWithoutUserInput | EmploymentUpdateWithWhereUniqueWithoutUserInput[]
    updateMany?: EmploymentUpdateManyWithWhereWithoutUserInput | EmploymentUpdateManyWithWhereWithoutUserInput[]
    deleteMany?: EmploymentScalarWhereInput | EmploymentScalarWhereInput[]
  }

  export type PrivilegeDelegationUpdateManyWithoutDelegatorUserNestedInput = {
    create?: XOR<PrivilegeDelegationCreateWithoutDelegatorUserInput, PrivilegeDelegationUncheckedCreateWithoutDelegatorUserInput> | PrivilegeDelegationCreateWithoutDelegatorUserInput[] | PrivilegeDelegationUncheckedCreateWithoutDelegatorUserInput[]
    connectOrCreate?: PrivilegeDelegationCreateOrConnectWithoutDelegatorUserInput | PrivilegeDelegationCreateOrConnectWithoutDelegatorUserInput[]
    upsert?: PrivilegeDelegationUpsertWithWhereUniqueWithoutDelegatorUserInput | PrivilegeDelegationUpsertWithWhereUniqueWithoutDelegatorUserInput[]
    createMany?: PrivilegeDelegationCreateManyDelegatorUserInputEnvelope
    set?: PrivilegeDelegationWhereUniqueInput | PrivilegeDelegationWhereUniqueInput[]
    disconnect?: PrivilegeDelegationWhereUniqueInput | PrivilegeDelegationWhereUniqueInput[]
    delete?: PrivilegeDelegationWhereUniqueInput | PrivilegeDelegationWhereUniqueInput[]
    connect?: PrivilegeDelegationWhereUniqueInput | PrivilegeDelegationWhereUniqueInput[]
    update?: PrivilegeDelegationUpdateWithWhereUniqueWithoutDelegatorUserInput | PrivilegeDelegationUpdateWithWhereUniqueWithoutDelegatorUserInput[]
    updateMany?: PrivilegeDelegationUpdateManyWithWhereWithoutDelegatorUserInput | PrivilegeDelegationUpdateManyWithWhereWithoutDelegatorUserInput[]
    deleteMany?: PrivilegeDelegationScalarWhereInput | PrivilegeDelegationScalarWhereInput[]
  }

  export type PrivilegeDelegationUpdateManyWithoutDelegateeUserNestedInput = {
    create?: XOR<PrivilegeDelegationCreateWithoutDelegateeUserInput, PrivilegeDelegationUncheckedCreateWithoutDelegateeUserInput> | PrivilegeDelegationCreateWithoutDelegateeUserInput[] | PrivilegeDelegationUncheckedCreateWithoutDelegateeUserInput[]
    connectOrCreate?: PrivilegeDelegationCreateOrConnectWithoutDelegateeUserInput | PrivilegeDelegationCreateOrConnectWithoutDelegateeUserInput[]
    upsert?: PrivilegeDelegationUpsertWithWhereUniqueWithoutDelegateeUserInput | PrivilegeDelegationUpsertWithWhereUniqueWithoutDelegateeUserInput[]
    createMany?: PrivilegeDelegationCreateManyDelegateeUserInputEnvelope
    set?: PrivilegeDelegationWhereUniqueInput | PrivilegeDelegationWhereUniqueInput[]
    disconnect?: PrivilegeDelegationWhereUniqueInput | PrivilegeDelegationWhereUniqueInput[]
    delete?: PrivilegeDelegationWhereUniqueInput | PrivilegeDelegationWhereUniqueInput[]
    connect?: PrivilegeDelegationWhereUniqueInput | PrivilegeDelegationWhereUniqueInput[]
    update?: PrivilegeDelegationUpdateWithWhereUniqueWithoutDelegateeUserInput | PrivilegeDelegationUpdateWithWhereUniqueWithoutDelegateeUserInput[]
    updateMany?: PrivilegeDelegationUpdateManyWithWhereWithoutDelegateeUserInput | PrivilegeDelegationUpdateManyWithWhereWithoutDelegateeUserInput[]
    deleteMany?: PrivilegeDelegationScalarWhereInput | PrivilegeDelegationScalarWhereInput[]
  }

  export type EmploymentUncheckedUpdateManyWithoutUserNestedInput = {
    create?: XOR<EmploymentCreateWithoutUserInput, EmploymentUncheckedCreateWithoutUserInput> | EmploymentCreateWithoutUserInput[] | EmploymentUncheckedCreateWithoutUserInput[]
    connectOrCreate?: EmploymentCreateOrConnectWithoutUserInput | EmploymentCreateOrConnectWithoutUserInput[]
    upsert?: EmploymentUpsertWithWhereUniqueWithoutUserInput | EmploymentUpsertWithWhereUniqueWithoutUserInput[]
    createMany?: EmploymentCreateManyUserInputEnvelope
    set?: EmploymentWhereUniqueInput | EmploymentWhereUniqueInput[]
    disconnect?: EmploymentWhereUniqueInput | EmploymentWhereUniqueInput[]
    delete?: EmploymentWhereUniqueInput | EmploymentWhereUniqueInput[]
    connect?: EmploymentWhereUniqueInput | EmploymentWhereUniqueInput[]
    update?: EmploymentUpdateWithWhereUniqueWithoutUserInput | EmploymentUpdateWithWhereUniqueWithoutUserInput[]
    updateMany?: EmploymentUpdateManyWithWhereWithoutUserInput | EmploymentUpdateManyWithWhereWithoutUserInput[]
    deleteMany?: EmploymentScalarWhereInput | EmploymentScalarWhereInput[]
  }

  export type PrivilegeDelegationUncheckedUpdateManyWithoutDelegatorUserNestedInput = {
    create?: XOR<PrivilegeDelegationCreateWithoutDelegatorUserInput, PrivilegeDelegationUncheckedCreateWithoutDelegatorUserInput> | PrivilegeDelegationCreateWithoutDelegatorUserInput[] | PrivilegeDelegationUncheckedCreateWithoutDelegatorUserInput[]
    connectOrCreate?: PrivilegeDelegationCreateOrConnectWithoutDelegatorUserInput | PrivilegeDelegationCreateOrConnectWithoutDelegatorUserInput[]
    upsert?: PrivilegeDelegationUpsertWithWhereUniqueWithoutDelegatorUserInput | PrivilegeDelegationUpsertWithWhereUniqueWithoutDelegatorUserInput[]
    createMany?: PrivilegeDelegationCreateManyDelegatorUserInputEnvelope
    set?: PrivilegeDelegationWhereUniqueInput | PrivilegeDelegationWhereUniqueInput[]
    disconnect?: PrivilegeDelegationWhereUniqueInput | PrivilegeDelegationWhereUniqueInput[]
    delete?: PrivilegeDelegationWhereUniqueInput | PrivilegeDelegationWhereUniqueInput[]
    connect?: PrivilegeDelegationWhereUniqueInput | PrivilegeDelegationWhereUniqueInput[]
    update?: PrivilegeDelegationUpdateWithWhereUniqueWithoutDelegatorUserInput | PrivilegeDelegationUpdateWithWhereUniqueWithoutDelegatorUserInput[]
    updateMany?: PrivilegeDelegationUpdateManyWithWhereWithoutDelegatorUserInput | PrivilegeDelegationUpdateManyWithWhereWithoutDelegatorUserInput[]
    deleteMany?: PrivilegeDelegationScalarWhereInput | PrivilegeDelegationScalarWhereInput[]
  }

  export type PrivilegeDelegationUncheckedUpdateManyWithoutDelegateeUserNestedInput = {
    create?: XOR<PrivilegeDelegationCreateWithoutDelegateeUserInput, PrivilegeDelegationUncheckedCreateWithoutDelegateeUserInput> | PrivilegeDelegationCreateWithoutDelegateeUserInput[] | PrivilegeDelegationUncheckedCreateWithoutDelegateeUserInput[]
    connectOrCreate?: PrivilegeDelegationCreateOrConnectWithoutDelegateeUserInput | PrivilegeDelegationCreateOrConnectWithoutDelegateeUserInput[]
    upsert?: PrivilegeDelegationUpsertWithWhereUniqueWithoutDelegateeUserInput | PrivilegeDelegationUpsertWithWhereUniqueWithoutDelegateeUserInput[]
    createMany?: PrivilegeDelegationCreateManyDelegateeUserInputEnvelope
    set?: PrivilegeDelegationWhereUniqueInput | PrivilegeDelegationWhereUniqueInput[]
    disconnect?: PrivilegeDelegationWhereUniqueInput | PrivilegeDelegationWhereUniqueInput[]
    delete?: PrivilegeDelegationWhereUniqueInput | PrivilegeDelegationWhereUniqueInput[]
    connect?: PrivilegeDelegationWhereUniqueInput | PrivilegeDelegationWhereUniqueInput[]
    update?: PrivilegeDelegationUpdateWithWhereUniqueWithoutDelegateeUserInput | PrivilegeDelegationUpdateWithWhereUniqueWithoutDelegateeUserInput[]
    updateMany?: PrivilegeDelegationUpdateManyWithWhereWithoutDelegateeUserInput | PrivilegeDelegationUpdateManyWithWhereWithoutDelegateeUserInput[]
    deleteMany?: PrivilegeDelegationScalarWhereInput | PrivilegeDelegationScalarWhereInput[]
  }

  export type EmploymentCreateNestedManyWithoutDeptartmentInput = {
    create?: XOR<EmploymentCreateWithoutDeptartmentInput, EmploymentUncheckedCreateWithoutDeptartmentInput> | EmploymentCreateWithoutDeptartmentInput[] | EmploymentUncheckedCreateWithoutDeptartmentInput[]
    connectOrCreate?: EmploymentCreateOrConnectWithoutDeptartmentInput | EmploymentCreateOrConnectWithoutDeptartmentInput[]
    createMany?: EmploymentCreateManyDeptartmentInputEnvelope
    connect?: EmploymentWhereUniqueInput | EmploymentWhereUniqueInput[]
  }

  export type EmploymentCreateNestedManyWithoutCompanyInput = {
    create?: XOR<EmploymentCreateWithoutCompanyInput, EmploymentUncheckedCreateWithoutCompanyInput> | EmploymentCreateWithoutCompanyInput[] | EmploymentUncheckedCreateWithoutCompanyInput[]
    connectOrCreate?: EmploymentCreateOrConnectWithoutCompanyInput | EmploymentCreateOrConnectWithoutCompanyInput[]
    createMany?: EmploymentCreateManyCompanyInputEnvelope
    connect?: EmploymentWhereUniqueInput | EmploymentWhereUniqueInput[]
  }

  export type OrganizationRoleCreateNestedManyWithoutOrganizationInput = {
    create?: XOR<OrganizationRoleCreateWithoutOrganizationInput, OrganizationRoleUncheckedCreateWithoutOrganizationInput> | OrganizationRoleCreateWithoutOrganizationInput[] | OrganizationRoleUncheckedCreateWithoutOrganizationInput[]
    connectOrCreate?: OrganizationRoleCreateOrConnectWithoutOrganizationInput | OrganizationRoleCreateOrConnectWithoutOrganizationInput[]
    createMany?: OrganizationRoleCreateManyOrganizationInputEnvelope
    connect?: OrganizationRoleWhereUniqueInput | OrganizationRoleWhereUniqueInput[]
  }

  export type EmploymentUncheckedCreateNestedManyWithoutDeptartmentInput = {
    create?: XOR<EmploymentCreateWithoutDeptartmentInput, EmploymentUncheckedCreateWithoutDeptartmentInput> | EmploymentCreateWithoutDeptartmentInput[] | EmploymentUncheckedCreateWithoutDeptartmentInput[]
    connectOrCreate?: EmploymentCreateOrConnectWithoutDeptartmentInput | EmploymentCreateOrConnectWithoutDeptartmentInput[]
    createMany?: EmploymentCreateManyDeptartmentInputEnvelope
    connect?: EmploymentWhereUniqueInput | EmploymentWhereUniqueInput[]
  }

  export type EmploymentUncheckedCreateNestedManyWithoutCompanyInput = {
    create?: XOR<EmploymentCreateWithoutCompanyInput, EmploymentUncheckedCreateWithoutCompanyInput> | EmploymentCreateWithoutCompanyInput[] | EmploymentUncheckedCreateWithoutCompanyInput[]
    connectOrCreate?: EmploymentCreateOrConnectWithoutCompanyInput | EmploymentCreateOrConnectWithoutCompanyInput[]
    createMany?: EmploymentCreateManyCompanyInputEnvelope
    connect?: EmploymentWhereUniqueInput | EmploymentWhereUniqueInput[]
  }

  export type OrganizationRoleUncheckedCreateNestedManyWithoutOrganizationInput = {
    create?: XOR<OrganizationRoleCreateWithoutOrganizationInput, OrganizationRoleUncheckedCreateWithoutOrganizationInput> | OrganizationRoleCreateWithoutOrganizationInput[] | OrganizationRoleUncheckedCreateWithoutOrganizationInput[]
    connectOrCreate?: OrganizationRoleCreateOrConnectWithoutOrganizationInput | OrganizationRoleCreateOrConnectWithoutOrganizationInput[]
    createMany?: OrganizationRoleCreateManyOrganizationInputEnvelope
    connect?: OrganizationRoleWhereUniqueInput | OrganizationRoleWhereUniqueInput[]
  }

  export type EmploymentUpdateManyWithoutDeptartmentNestedInput = {
    create?: XOR<EmploymentCreateWithoutDeptartmentInput, EmploymentUncheckedCreateWithoutDeptartmentInput> | EmploymentCreateWithoutDeptartmentInput[] | EmploymentUncheckedCreateWithoutDeptartmentInput[]
    connectOrCreate?: EmploymentCreateOrConnectWithoutDeptartmentInput | EmploymentCreateOrConnectWithoutDeptartmentInput[]
    upsert?: EmploymentUpsertWithWhereUniqueWithoutDeptartmentInput | EmploymentUpsertWithWhereUniqueWithoutDeptartmentInput[]
    createMany?: EmploymentCreateManyDeptartmentInputEnvelope
    set?: EmploymentWhereUniqueInput | EmploymentWhereUniqueInput[]
    disconnect?: EmploymentWhereUniqueInput | EmploymentWhereUniqueInput[]
    delete?: EmploymentWhereUniqueInput | EmploymentWhereUniqueInput[]
    connect?: EmploymentWhereUniqueInput | EmploymentWhereUniqueInput[]
    update?: EmploymentUpdateWithWhereUniqueWithoutDeptartmentInput | EmploymentUpdateWithWhereUniqueWithoutDeptartmentInput[]
    updateMany?: EmploymentUpdateManyWithWhereWithoutDeptartmentInput | EmploymentUpdateManyWithWhereWithoutDeptartmentInput[]
    deleteMany?: EmploymentScalarWhereInput | EmploymentScalarWhereInput[]
  }

  export type EmploymentUpdateManyWithoutCompanyNestedInput = {
    create?: XOR<EmploymentCreateWithoutCompanyInput, EmploymentUncheckedCreateWithoutCompanyInput> | EmploymentCreateWithoutCompanyInput[] | EmploymentUncheckedCreateWithoutCompanyInput[]
    connectOrCreate?: EmploymentCreateOrConnectWithoutCompanyInput | EmploymentCreateOrConnectWithoutCompanyInput[]
    upsert?: EmploymentUpsertWithWhereUniqueWithoutCompanyInput | EmploymentUpsertWithWhereUniqueWithoutCompanyInput[]
    createMany?: EmploymentCreateManyCompanyInputEnvelope
    set?: EmploymentWhereUniqueInput | EmploymentWhereUniqueInput[]
    disconnect?: EmploymentWhereUniqueInput | EmploymentWhereUniqueInput[]
    delete?: EmploymentWhereUniqueInput | EmploymentWhereUniqueInput[]
    connect?: EmploymentWhereUniqueInput | EmploymentWhereUniqueInput[]
    update?: EmploymentUpdateWithWhereUniqueWithoutCompanyInput | EmploymentUpdateWithWhereUniqueWithoutCompanyInput[]
    updateMany?: EmploymentUpdateManyWithWhereWithoutCompanyInput | EmploymentUpdateManyWithWhereWithoutCompanyInput[]
    deleteMany?: EmploymentScalarWhereInput | EmploymentScalarWhereInput[]
  }

  export type OrganizationRoleUpdateManyWithoutOrganizationNestedInput = {
    create?: XOR<OrganizationRoleCreateWithoutOrganizationInput, OrganizationRoleUncheckedCreateWithoutOrganizationInput> | OrganizationRoleCreateWithoutOrganizationInput[] | OrganizationRoleUncheckedCreateWithoutOrganizationInput[]
    connectOrCreate?: OrganizationRoleCreateOrConnectWithoutOrganizationInput | OrganizationRoleCreateOrConnectWithoutOrganizationInput[]
    upsert?: OrganizationRoleUpsertWithWhereUniqueWithoutOrganizationInput | OrganizationRoleUpsertWithWhereUniqueWithoutOrganizationInput[]
    createMany?: OrganizationRoleCreateManyOrganizationInputEnvelope
    set?: OrganizationRoleWhereUniqueInput | OrganizationRoleWhereUniqueInput[]
    disconnect?: OrganizationRoleWhereUniqueInput | OrganizationRoleWhereUniqueInput[]
    delete?: OrganizationRoleWhereUniqueInput | OrganizationRoleWhereUniqueInput[]
    connect?: OrganizationRoleWhereUniqueInput | OrganizationRoleWhereUniqueInput[]
    update?: OrganizationRoleUpdateWithWhereUniqueWithoutOrganizationInput | OrganizationRoleUpdateWithWhereUniqueWithoutOrganizationInput[]
    updateMany?: OrganizationRoleUpdateManyWithWhereWithoutOrganizationInput | OrganizationRoleUpdateManyWithWhereWithoutOrganizationInput[]
    deleteMany?: OrganizationRoleScalarWhereInput | OrganizationRoleScalarWhereInput[]
  }

  export type EmploymentUncheckedUpdateManyWithoutDeptartmentNestedInput = {
    create?: XOR<EmploymentCreateWithoutDeptartmentInput, EmploymentUncheckedCreateWithoutDeptartmentInput> | EmploymentCreateWithoutDeptartmentInput[] | EmploymentUncheckedCreateWithoutDeptartmentInput[]
    connectOrCreate?: EmploymentCreateOrConnectWithoutDeptartmentInput | EmploymentCreateOrConnectWithoutDeptartmentInput[]
    upsert?: EmploymentUpsertWithWhereUniqueWithoutDeptartmentInput | EmploymentUpsertWithWhereUniqueWithoutDeptartmentInput[]
    createMany?: EmploymentCreateManyDeptartmentInputEnvelope
    set?: EmploymentWhereUniqueInput | EmploymentWhereUniqueInput[]
    disconnect?: EmploymentWhereUniqueInput | EmploymentWhereUniqueInput[]
    delete?: EmploymentWhereUniqueInput | EmploymentWhereUniqueInput[]
    connect?: EmploymentWhereUniqueInput | EmploymentWhereUniqueInput[]
    update?: EmploymentUpdateWithWhereUniqueWithoutDeptartmentInput | EmploymentUpdateWithWhereUniqueWithoutDeptartmentInput[]
    updateMany?: EmploymentUpdateManyWithWhereWithoutDeptartmentInput | EmploymentUpdateManyWithWhereWithoutDeptartmentInput[]
    deleteMany?: EmploymentScalarWhereInput | EmploymentScalarWhereInput[]
  }

  export type EmploymentUncheckedUpdateManyWithoutCompanyNestedInput = {
    create?: XOR<EmploymentCreateWithoutCompanyInput, EmploymentUncheckedCreateWithoutCompanyInput> | EmploymentCreateWithoutCompanyInput[] | EmploymentUncheckedCreateWithoutCompanyInput[]
    connectOrCreate?: EmploymentCreateOrConnectWithoutCompanyInput | EmploymentCreateOrConnectWithoutCompanyInput[]
    upsert?: EmploymentUpsertWithWhereUniqueWithoutCompanyInput | EmploymentUpsertWithWhereUniqueWithoutCompanyInput[]
    createMany?: EmploymentCreateManyCompanyInputEnvelope
    set?: EmploymentWhereUniqueInput | EmploymentWhereUniqueInput[]
    disconnect?: EmploymentWhereUniqueInput | EmploymentWhereUniqueInput[]
    delete?: EmploymentWhereUniqueInput | EmploymentWhereUniqueInput[]
    connect?: EmploymentWhereUniqueInput | EmploymentWhereUniqueInput[]
    update?: EmploymentUpdateWithWhereUniqueWithoutCompanyInput | EmploymentUpdateWithWhereUniqueWithoutCompanyInput[]
    updateMany?: EmploymentUpdateManyWithWhereWithoutCompanyInput | EmploymentUpdateManyWithWhereWithoutCompanyInput[]
    deleteMany?: EmploymentScalarWhereInput | EmploymentScalarWhereInput[]
  }

  export type OrganizationRoleUncheckedUpdateManyWithoutOrganizationNestedInput = {
    create?: XOR<OrganizationRoleCreateWithoutOrganizationInput, OrganizationRoleUncheckedCreateWithoutOrganizationInput> | OrganizationRoleCreateWithoutOrganizationInput[] | OrganizationRoleUncheckedCreateWithoutOrganizationInput[]
    connectOrCreate?: OrganizationRoleCreateOrConnectWithoutOrganizationInput | OrganizationRoleCreateOrConnectWithoutOrganizationInput[]
    upsert?: OrganizationRoleUpsertWithWhereUniqueWithoutOrganizationInput | OrganizationRoleUpsertWithWhereUniqueWithoutOrganizationInput[]
    createMany?: OrganizationRoleCreateManyOrganizationInputEnvelope
    set?: OrganizationRoleWhereUniqueInput | OrganizationRoleWhereUniqueInput[]
    disconnect?: OrganizationRoleWhereUniqueInput | OrganizationRoleWhereUniqueInput[]
    delete?: OrganizationRoleWhereUniqueInput | OrganizationRoleWhereUniqueInput[]
    connect?: OrganizationRoleWhereUniqueInput | OrganizationRoleWhereUniqueInput[]
    update?: OrganizationRoleUpdateWithWhereUniqueWithoutOrganizationInput | OrganizationRoleUpdateWithWhereUniqueWithoutOrganizationInput[]
    updateMany?: OrganizationRoleUpdateManyWithWhereWithoutOrganizationInput | OrganizationRoleUpdateManyWithWhereWithoutOrganizationInput[]
    deleteMany?: OrganizationRoleScalarWhereInput | OrganizationRoleScalarWhereInput[]
  }

  export type EmploymentCreateNestedManyWithoutPositionInput = {
    create?: XOR<EmploymentCreateWithoutPositionInput, EmploymentUncheckedCreateWithoutPositionInput> | EmploymentCreateWithoutPositionInput[] | EmploymentUncheckedCreateWithoutPositionInput[]
    connectOrCreate?: EmploymentCreateOrConnectWithoutPositionInput | EmploymentCreateOrConnectWithoutPositionInput[]
    createMany?: EmploymentCreateManyPositionInputEnvelope
    connect?: EmploymentWhereUniqueInput | EmploymentWhereUniqueInput[]
  }

  export type PositionRoleCreateNestedManyWithoutPositionInput = {
    create?: XOR<PositionRoleCreateWithoutPositionInput, PositionRoleUncheckedCreateWithoutPositionInput> | PositionRoleCreateWithoutPositionInput[] | PositionRoleUncheckedCreateWithoutPositionInput[]
    connectOrCreate?: PositionRoleCreateOrConnectWithoutPositionInput | PositionRoleCreateOrConnectWithoutPositionInput[]
    createMany?: PositionRoleCreateManyPositionInputEnvelope
    connect?: PositionRoleWhereUniqueInput | PositionRoleWhereUniqueInput[]
  }

  export type EmploymentUncheckedCreateNestedManyWithoutPositionInput = {
    create?: XOR<EmploymentCreateWithoutPositionInput, EmploymentUncheckedCreateWithoutPositionInput> | EmploymentCreateWithoutPositionInput[] | EmploymentUncheckedCreateWithoutPositionInput[]
    connectOrCreate?: EmploymentCreateOrConnectWithoutPositionInput | EmploymentCreateOrConnectWithoutPositionInput[]
    createMany?: EmploymentCreateManyPositionInputEnvelope
    connect?: EmploymentWhereUniqueInput | EmploymentWhereUniqueInput[]
  }

  export type PositionRoleUncheckedCreateNestedManyWithoutPositionInput = {
    create?: XOR<PositionRoleCreateWithoutPositionInput, PositionRoleUncheckedCreateWithoutPositionInput> | PositionRoleCreateWithoutPositionInput[] | PositionRoleUncheckedCreateWithoutPositionInput[]
    connectOrCreate?: PositionRoleCreateOrConnectWithoutPositionInput | PositionRoleCreateOrConnectWithoutPositionInput[]
    createMany?: PositionRoleCreateManyPositionInputEnvelope
    connect?: PositionRoleWhereUniqueInput | PositionRoleWhereUniqueInput[]
  }

  export type EmploymentUpdateManyWithoutPositionNestedInput = {
    create?: XOR<EmploymentCreateWithoutPositionInput, EmploymentUncheckedCreateWithoutPositionInput> | EmploymentCreateWithoutPositionInput[] | EmploymentUncheckedCreateWithoutPositionInput[]
    connectOrCreate?: EmploymentCreateOrConnectWithoutPositionInput | EmploymentCreateOrConnectWithoutPositionInput[]
    upsert?: EmploymentUpsertWithWhereUniqueWithoutPositionInput | EmploymentUpsertWithWhereUniqueWithoutPositionInput[]
    createMany?: EmploymentCreateManyPositionInputEnvelope
    set?: EmploymentWhereUniqueInput | EmploymentWhereUniqueInput[]
    disconnect?: EmploymentWhereUniqueInput | EmploymentWhereUniqueInput[]
    delete?: EmploymentWhereUniqueInput | EmploymentWhereUniqueInput[]
    connect?: EmploymentWhereUniqueInput | EmploymentWhereUniqueInput[]
    update?: EmploymentUpdateWithWhereUniqueWithoutPositionInput | EmploymentUpdateWithWhereUniqueWithoutPositionInput[]
    updateMany?: EmploymentUpdateManyWithWhereWithoutPositionInput | EmploymentUpdateManyWithWhereWithoutPositionInput[]
    deleteMany?: EmploymentScalarWhereInput | EmploymentScalarWhereInput[]
  }

  export type PositionRoleUpdateManyWithoutPositionNestedInput = {
    create?: XOR<PositionRoleCreateWithoutPositionInput, PositionRoleUncheckedCreateWithoutPositionInput> | PositionRoleCreateWithoutPositionInput[] | PositionRoleUncheckedCreateWithoutPositionInput[]
    connectOrCreate?: PositionRoleCreateOrConnectWithoutPositionInput | PositionRoleCreateOrConnectWithoutPositionInput[]
    upsert?: PositionRoleUpsertWithWhereUniqueWithoutPositionInput | PositionRoleUpsertWithWhereUniqueWithoutPositionInput[]
    createMany?: PositionRoleCreateManyPositionInputEnvelope
    set?: PositionRoleWhereUniqueInput | PositionRoleWhereUniqueInput[]
    disconnect?: PositionRoleWhereUniqueInput | PositionRoleWhereUniqueInput[]
    delete?: PositionRoleWhereUniqueInput | PositionRoleWhereUniqueInput[]
    connect?: PositionRoleWhereUniqueInput | PositionRoleWhereUniqueInput[]
    update?: PositionRoleUpdateWithWhereUniqueWithoutPositionInput | PositionRoleUpdateWithWhereUniqueWithoutPositionInput[]
    updateMany?: PositionRoleUpdateManyWithWhereWithoutPositionInput | PositionRoleUpdateManyWithWhereWithoutPositionInput[]
    deleteMany?: PositionRoleScalarWhereInput | PositionRoleScalarWhereInput[]
  }

  export type EmploymentUncheckedUpdateManyWithoutPositionNestedInput = {
    create?: XOR<EmploymentCreateWithoutPositionInput, EmploymentUncheckedCreateWithoutPositionInput> | EmploymentCreateWithoutPositionInput[] | EmploymentUncheckedCreateWithoutPositionInput[]
    connectOrCreate?: EmploymentCreateOrConnectWithoutPositionInput | EmploymentCreateOrConnectWithoutPositionInput[]
    upsert?: EmploymentUpsertWithWhereUniqueWithoutPositionInput | EmploymentUpsertWithWhereUniqueWithoutPositionInput[]
    createMany?: EmploymentCreateManyPositionInputEnvelope
    set?: EmploymentWhereUniqueInput | EmploymentWhereUniqueInput[]
    disconnect?: EmploymentWhereUniqueInput | EmploymentWhereUniqueInput[]
    delete?: EmploymentWhereUniqueInput | EmploymentWhereUniqueInput[]
    connect?: EmploymentWhereUniqueInput | EmploymentWhereUniqueInput[]
    update?: EmploymentUpdateWithWhereUniqueWithoutPositionInput | EmploymentUpdateWithWhereUniqueWithoutPositionInput[]
    updateMany?: EmploymentUpdateManyWithWhereWithoutPositionInput | EmploymentUpdateManyWithWhereWithoutPositionInput[]
    deleteMany?: EmploymentScalarWhereInput | EmploymentScalarWhereInput[]
  }

  export type PositionRoleUncheckedUpdateManyWithoutPositionNestedInput = {
    create?: XOR<PositionRoleCreateWithoutPositionInput, PositionRoleUncheckedCreateWithoutPositionInput> | PositionRoleCreateWithoutPositionInput[] | PositionRoleUncheckedCreateWithoutPositionInput[]
    connectOrCreate?: PositionRoleCreateOrConnectWithoutPositionInput | PositionRoleCreateOrConnectWithoutPositionInput[]
    upsert?: PositionRoleUpsertWithWhereUniqueWithoutPositionInput | PositionRoleUpsertWithWhereUniqueWithoutPositionInput[]
    createMany?: PositionRoleCreateManyPositionInputEnvelope
    set?: PositionRoleWhereUniqueInput | PositionRoleWhereUniqueInput[]
    disconnect?: PositionRoleWhereUniqueInput | PositionRoleWhereUniqueInput[]
    delete?: PositionRoleWhereUniqueInput | PositionRoleWhereUniqueInput[]
    connect?: PositionRoleWhereUniqueInput | PositionRoleWhereUniqueInput[]
    update?: PositionRoleUpdateWithWhereUniqueWithoutPositionInput | PositionRoleUpdateWithWhereUniqueWithoutPositionInput[]
    updateMany?: PositionRoleUpdateManyWithWhereWithoutPositionInput | PositionRoleUpdateManyWithWhereWithoutPositionInput[]
    deleteMany?: PositionRoleScalarWhereInput | PositionRoleScalarWhereInput[]
  }

  export type UserCreateNestedOneWithoutEmploymentsInput = {
    create?: XOR<UserCreateWithoutEmploymentsInput, UserUncheckedCreateWithoutEmploymentsInput>
    connectOrCreate?: UserCreateOrConnectWithoutEmploymentsInput
    connect?: UserWhereUniqueInput
  }

  export type OrganizationCreateNestedOneWithoutDeptEmploymentsInput = {
    create?: XOR<OrganizationCreateWithoutDeptEmploymentsInput, OrganizationUncheckedCreateWithoutDeptEmploymentsInput>
    connectOrCreate?: OrganizationCreateOrConnectWithoutDeptEmploymentsInput
    connect?: OrganizationWhereUniqueInput
  }

  export type OrganizationCreateNestedOneWithoutCompEmploymentsInput = {
    create?: XOR<OrganizationCreateWithoutCompEmploymentsInput, OrganizationUncheckedCreateWithoutCompEmploymentsInput>
    connectOrCreate?: OrganizationCreateOrConnectWithoutCompEmploymentsInput
    connect?: OrganizationWhereUniqueInput
  }

  export type PositionCreateNestedOneWithoutEmploymentsInput = {
    create?: XOR<PositionCreateWithoutEmploymentsInput, PositionUncheckedCreateWithoutEmploymentsInput>
    connectOrCreate?: PositionCreateOrConnectWithoutEmploymentsInput
    connect?: PositionWhereUniqueInput
  }

  export type EmploymentRoleCreateNestedManyWithoutEmploymentInput = {
    create?: XOR<EmploymentRoleCreateWithoutEmploymentInput, EmploymentRoleUncheckedCreateWithoutEmploymentInput> | EmploymentRoleCreateWithoutEmploymentInput[] | EmploymentRoleUncheckedCreateWithoutEmploymentInput[]
    connectOrCreate?: EmploymentRoleCreateOrConnectWithoutEmploymentInput | EmploymentRoleCreateOrConnectWithoutEmploymentInput[]
    createMany?: EmploymentRoleCreateManyEmploymentInputEnvelope
    connect?: EmploymentRoleWhereUniqueInput | EmploymentRoleWhereUniqueInput[]
  }

  export type EmploymentRoleUncheckedCreateNestedManyWithoutEmploymentInput = {
    create?: XOR<EmploymentRoleCreateWithoutEmploymentInput, EmploymentRoleUncheckedCreateWithoutEmploymentInput> | EmploymentRoleCreateWithoutEmploymentInput[] | EmploymentRoleUncheckedCreateWithoutEmploymentInput[]
    connectOrCreate?: EmploymentRoleCreateOrConnectWithoutEmploymentInput | EmploymentRoleCreateOrConnectWithoutEmploymentInput[]
    createMany?: EmploymentRoleCreateManyEmploymentInputEnvelope
    connect?: EmploymentRoleWhereUniqueInput | EmploymentRoleWhereUniqueInput[]
  }

  export type UserUpdateOneRequiredWithoutEmploymentsNestedInput = {
    create?: XOR<UserCreateWithoutEmploymentsInput, UserUncheckedCreateWithoutEmploymentsInput>
    connectOrCreate?: UserCreateOrConnectWithoutEmploymentsInput
    upsert?: UserUpsertWithoutEmploymentsInput
    connect?: UserWhereUniqueInput
    update?: XOR<XOR<UserUpdateToOneWithWhereWithoutEmploymentsInput, UserUpdateWithoutEmploymentsInput>, UserUncheckedUpdateWithoutEmploymentsInput>
  }

  export type OrganizationUpdateOneRequiredWithoutDeptEmploymentsNestedInput = {
    create?: XOR<OrganizationCreateWithoutDeptEmploymentsInput, OrganizationUncheckedCreateWithoutDeptEmploymentsInput>
    connectOrCreate?: OrganizationCreateOrConnectWithoutDeptEmploymentsInput
    upsert?: OrganizationUpsertWithoutDeptEmploymentsInput
    connect?: OrganizationWhereUniqueInput
    update?: XOR<XOR<OrganizationUpdateToOneWithWhereWithoutDeptEmploymentsInput, OrganizationUpdateWithoutDeptEmploymentsInput>, OrganizationUncheckedUpdateWithoutDeptEmploymentsInput>
  }

  export type OrganizationUpdateOneRequiredWithoutCompEmploymentsNestedInput = {
    create?: XOR<OrganizationCreateWithoutCompEmploymentsInput, OrganizationUncheckedCreateWithoutCompEmploymentsInput>
    connectOrCreate?: OrganizationCreateOrConnectWithoutCompEmploymentsInput
    upsert?: OrganizationUpsertWithoutCompEmploymentsInput
    connect?: OrganizationWhereUniqueInput
    update?: XOR<XOR<OrganizationUpdateToOneWithWhereWithoutCompEmploymentsInput, OrganizationUpdateWithoutCompEmploymentsInput>, OrganizationUncheckedUpdateWithoutCompEmploymentsInput>
  }

  export type PositionUpdateOneRequiredWithoutEmploymentsNestedInput = {
    create?: XOR<PositionCreateWithoutEmploymentsInput, PositionUncheckedCreateWithoutEmploymentsInput>
    connectOrCreate?: PositionCreateOrConnectWithoutEmploymentsInput
    upsert?: PositionUpsertWithoutEmploymentsInput
    connect?: PositionWhereUniqueInput
    update?: XOR<XOR<PositionUpdateToOneWithWhereWithoutEmploymentsInput, PositionUpdateWithoutEmploymentsInput>, PositionUncheckedUpdateWithoutEmploymentsInput>
  }

  export type EmploymentRoleUpdateManyWithoutEmploymentNestedInput = {
    create?: XOR<EmploymentRoleCreateWithoutEmploymentInput, EmploymentRoleUncheckedCreateWithoutEmploymentInput> | EmploymentRoleCreateWithoutEmploymentInput[] | EmploymentRoleUncheckedCreateWithoutEmploymentInput[]
    connectOrCreate?: EmploymentRoleCreateOrConnectWithoutEmploymentInput | EmploymentRoleCreateOrConnectWithoutEmploymentInput[]
    upsert?: EmploymentRoleUpsertWithWhereUniqueWithoutEmploymentInput | EmploymentRoleUpsertWithWhereUniqueWithoutEmploymentInput[]
    createMany?: EmploymentRoleCreateManyEmploymentInputEnvelope
    set?: EmploymentRoleWhereUniqueInput | EmploymentRoleWhereUniqueInput[]
    disconnect?: EmploymentRoleWhereUniqueInput | EmploymentRoleWhereUniqueInput[]
    delete?: EmploymentRoleWhereUniqueInput | EmploymentRoleWhereUniqueInput[]
    connect?: EmploymentRoleWhereUniqueInput | EmploymentRoleWhereUniqueInput[]
    update?: EmploymentRoleUpdateWithWhereUniqueWithoutEmploymentInput | EmploymentRoleUpdateWithWhereUniqueWithoutEmploymentInput[]
    updateMany?: EmploymentRoleUpdateManyWithWhereWithoutEmploymentInput | EmploymentRoleUpdateManyWithWhereWithoutEmploymentInput[]
    deleteMany?: EmploymentRoleScalarWhereInput | EmploymentRoleScalarWhereInput[]
  }

  export type EmploymentRoleUncheckedUpdateManyWithoutEmploymentNestedInput = {
    create?: XOR<EmploymentRoleCreateWithoutEmploymentInput, EmploymentRoleUncheckedCreateWithoutEmploymentInput> | EmploymentRoleCreateWithoutEmploymentInput[] | EmploymentRoleUncheckedCreateWithoutEmploymentInput[]
    connectOrCreate?: EmploymentRoleCreateOrConnectWithoutEmploymentInput | EmploymentRoleCreateOrConnectWithoutEmploymentInput[]
    upsert?: EmploymentRoleUpsertWithWhereUniqueWithoutEmploymentInput | EmploymentRoleUpsertWithWhereUniqueWithoutEmploymentInput[]
    createMany?: EmploymentRoleCreateManyEmploymentInputEnvelope
    set?: EmploymentRoleWhereUniqueInput | EmploymentRoleWhereUniqueInput[]
    disconnect?: EmploymentRoleWhereUniqueInput | EmploymentRoleWhereUniqueInput[]
    delete?: EmploymentRoleWhereUniqueInput | EmploymentRoleWhereUniqueInput[]
    connect?: EmploymentRoleWhereUniqueInput | EmploymentRoleWhereUniqueInput[]
    update?: EmploymentRoleUpdateWithWhereUniqueWithoutEmploymentInput | EmploymentRoleUpdateWithWhereUniqueWithoutEmploymentInput[]
    updateMany?: EmploymentRoleUpdateManyWithWhereWithoutEmploymentInput | EmploymentRoleUpdateManyWithWhereWithoutEmploymentInput[]
    deleteMany?: EmploymentRoleScalarWhereInput | EmploymentRoleScalarWhereInput[]
  }

  export type RoleCreateNestedManyWithoutClientInput = {
    create?: XOR<RoleCreateWithoutClientInput, RoleUncheckedCreateWithoutClientInput> | RoleCreateWithoutClientInput[] | RoleUncheckedCreateWithoutClientInput[]
    connectOrCreate?: RoleCreateOrConnectWithoutClientInput | RoleCreateOrConnectWithoutClientInput[]
    createMany?: RoleCreateManyClientInputEnvelope
    connect?: RoleWhereUniqueInput | RoleWhereUniqueInput[]
  }

  export type RoleUncheckedCreateNestedManyWithoutClientInput = {
    create?: XOR<RoleCreateWithoutClientInput, RoleUncheckedCreateWithoutClientInput> | RoleCreateWithoutClientInput[] | RoleUncheckedCreateWithoutClientInput[]
    connectOrCreate?: RoleCreateOrConnectWithoutClientInput | RoleCreateOrConnectWithoutClientInput[]
    createMany?: RoleCreateManyClientInputEnvelope
    connect?: RoleWhereUniqueInput | RoleWhereUniqueInput[]
  }

  export type RoleUpdateManyWithoutClientNestedInput = {
    create?: XOR<RoleCreateWithoutClientInput, RoleUncheckedCreateWithoutClientInput> | RoleCreateWithoutClientInput[] | RoleUncheckedCreateWithoutClientInput[]
    connectOrCreate?: RoleCreateOrConnectWithoutClientInput | RoleCreateOrConnectWithoutClientInput[]
    upsert?: RoleUpsertWithWhereUniqueWithoutClientInput | RoleUpsertWithWhereUniqueWithoutClientInput[]
    createMany?: RoleCreateManyClientInputEnvelope
    set?: RoleWhereUniqueInput | RoleWhereUniqueInput[]
    disconnect?: RoleWhereUniqueInput | RoleWhereUniqueInput[]
    delete?: RoleWhereUniqueInput | RoleWhereUniqueInput[]
    connect?: RoleWhereUniqueInput | RoleWhereUniqueInput[]
    update?: RoleUpdateWithWhereUniqueWithoutClientInput | RoleUpdateWithWhereUniqueWithoutClientInput[]
    updateMany?: RoleUpdateManyWithWhereWithoutClientInput | RoleUpdateManyWithWhereWithoutClientInput[]
    deleteMany?: RoleScalarWhereInput | RoleScalarWhereInput[]
  }

  export type RoleUncheckedUpdateManyWithoutClientNestedInput = {
    create?: XOR<RoleCreateWithoutClientInput, RoleUncheckedCreateWithoutClientInput> | RoleCreateWithoutClientInput[] | RoleUncheckedCreateWithoutClientInput[]
    connectOrCreate?: RoleCreateOrConnectWithoutClientInput | RoleCreateOrConnectWithoutClientInput[]
    upsert?: RoleUpsertWithWhereUniqueWithoutClientInput | RoleUpsertWithWhereUniqueWithoutClientInput[]
    createMany?: RoleCreateManyClientInputEnvelope
    set?: RoleWhereUniqueInput | RoleWhereUniqueInput[]
    disconnect?: RoleWhereUniqueInput | RoleWhereUniqueInput[]
    delete?: RoleWhereUniqueInput | RoleWhereUniqueInput[]
    connect?: RoleWhereUniqueInput | RoleWhereUniqueInput[]
    update?: RoleUpdateWithWhereUniqueWithoutClientInput | RoleUpdateWithWhereUniqueWithoutClientInput[]
    updateMany?: RoleUpdateManyWithWhereWithoutClientInput | RoleUpdateManyWithWhereWithoutClientInput[]
    deleteMany?: RoleScalarWhereInput | RoleScalarWhereInput[]
  }

  export type ClientCreateNestedOneWithoutRoleInput = {
    create?: XOR<ClientCreateWithoutRoleInput, ClientUncheckedCreateWithoutRoleInput>
    connectOrCreate?: ClientCreateOrConnectWithoutRoleInput
    connect?: ClientWhereUniqueInput
  }

  export type PositionRoleCreateNestedManyWithoutRoleInput = {
    create?: XOR<PositionRoleCreateWithoutRoleInput, PositionRoleUncheckedCreateWithoutRoleInput> | PositionRoleCreateWithoutRoleInput[] | PositionRoleUncheckedCreateWithoutRoleInput[]
    connectOrCreate?: PositionRoleCreateOrConnectWithoutRoleInput | PositionRoleCreateOrConnectWithoutRoleInput[]
    createMany?: PositionRoleCreateManyRoleInputEnvelope
    connect?: PositionRoleWhereUniqueInput | PositionRoleWhereUniqueInput[]
  }

  export type OrganizationRoleCreateNestedManyWithoutRoleInput = {
    create?: XOR<OrganizationRoleCreateWithoutRoleInput, OrganizationRoleUncheckedCreateWithoutRoleInput> | OrganizationRoleCreateWithoutRoleInput[] | OrganizationRoleUncheckedCreateWithoutRoleInput[]
    connectOrCreate?: OrganizationRoleCreateOrConnectWithoutRoleInput | OrganizationRoleCreateOrConnectWithoutRoleInput[]
    createMany?: OrganizationRoleCreateManyRoleInputEnvelope
    connect?: OrganizationRoleWhereUniqueInput | OrganizationRoleWhereUniqueInput[]
  }

  export type EmploymentRoleCreateNestedManyWithoutRoleInput = {
    create?: XOR<EmploymentRoleCreateWithoutRoleInput, EmploymentRoleUncheckedCreateWithoutRoleInput> | EmploymentRoleCreateWithoutRoleInput[] | EmploymentRoleUncheckedCreateWithoutRoleInput[]
    connectOrCreate?: EmploymentRoleCreateOrConnectWithoutRoleInput | EmploymentRoleCreateOrConnectWithoutRoleInput[]
    createMany?: EmploymentRoleCreateManyRoleInputEnvelope
    connect?: EmploymentRoleWhereUniqueInput | EmploymentRoleWhereUniqueInput[]
  }

  export type RolePrivilegeCreateNestedManyWithoutRoleInput = {
    create?: XOR<RolePrivilegeCreateWithoutRoleInput, RolePrivilegeUncheckedCreateWithoutRoleInput> | RolePrivilegeCreateWithoutRoleInput[] | RolePrivilegeUncheckedCreateWithoutRoleInput[]
    connectOrCreate?: RolePrivilegeCreateOrConnectWithoutRoleInput | RolePrivilegeCreateOrConnectWithoutRoleInput[]
    createMany?: RolePrivilegeCreateManyRoleInputEnvelope
    connect?: RolePrivilegeWhereUniqueInput | RolePrivilegeWhereUniqueInput[]
  }

  export type PositionRoleUncheckedCreateNestedManyWithoutRoleInput = {
    create?: XOR<PositionRoleCreateWithoutRoleInput, PositionRoleUncheckedCreateWithoutRoleInput> | PositionRoleCreateWithoutRoleInput[] | PositionRoleUncheckedCreateWithoutRoleInput[]
    connectOrCreate?: PositionRoleCreateOrConnectWithoutRoleInput | PositionRoleCreateOrConnectWithoutRoleInput[]
    createMany?: PositionRoleCreateManyRoleInputEnvelope
    connect?: PositionRoleWhereUniqueInput | PositionRoleWhereUniqueInput[]
  }

  export type OrganizationRoleUncheckedCreateNestedManyWithoutRoleInput = {
    create?: XOR<OrganizationRoleCreateWithoutRoleInput, OrganizationRoleUncheckedCreateWithoutRoleInput> | OrganizationRoleCreateWithoutRoleInput[] | OrganizationRoleUncheckedCreateWithoutRoleInput[]
    connectOrCreate?: OrganizationRoleCreateOrConnectWithoutRoleInput | OrganizationRoleCreateOrConnectWithoutRoleInput[]
    createMany?: OrganizationRoleCreateManyRoleInputEnvelope
    connect?: OrganizationRoleWhereUniqueInput | OrganizationRoleWhereUniqueInput[]
  }

  export type EmploymentRoleUncheckedCreateNestedManyWithoutRoleInput = {
    create?: XOR<EmploymentRoleCreateWithoutRoleInput, EmploymentRoleUncheckedCreateWithoutRoleInput> | EmploymentRoleCreateWithoutRoleInput[] | EmploymentRoleUncheckedCreateWithoutRoleInput[]
    connectOrCreate?: EmploymentRoleCreateOrConnectWithoutRoleInput | EmploymentRoleCreateOrConnectWithoutRoleInput[]
    createMany?: EmploymentRoleCreateManyRoleInputEnvelope
    connect?: EmploymentRoleWhereUniqueInput | EmploymentRoleWhereUniqueInput[]
  }

  export type RolePrivilegeUncheckedCreateNestedManyWithoutRoleInput = {
    create?: XOR<RolePrivilegeCreateWithoutRoleInput, RolePrivilegeUncheckedCreateWithoutRoleInput> | RolePrivilegeCreateWithoutRoleInput[] | RolePrivilegeUncheckedCreateWithoutRoleInput[]
    connectOrCreate?: RolePrivilegeCreateOrConnectWithoutRoleInput | RolePrivilegeCreateOrConnectWithoutRoleInput[]
    createMany?: RolePrivilegeCreateManyRoleInputEnvelope
    connect?: RolePrivilegeWhereUniqueInput | RolePrivilegeWhereUniqueInput[]
  }

  export type ClientUpdateOneRequiredWithoutRoleNestedInput = {
    create?: XOR<ClientCreateWithoutRoleInput, ClientUncheckedCreateWithoutRoleInput>
    connectOrCreate?: ClientCreateOrConnectWithoutRoleInput
    upsert?: ClientUpsertWithoutRoleInput
    connect?: ClientWhereUniqueInput
    update?: XOR<XOR<ClientUpdateToOneWithWhereWithoutRoleInput, ClientUpdateWithoutRoleInput>, ClientUncheckedUpdateWithoutRoleInput>
  }

  export type PositionRoleUpdateManyWithoutRoleNestedInput = {
    create?: XOR<PositionRoleCreateWithoutRoleInput, PositionRoleUncheckedCreateWithoutRoleInput> | PositionRoleCreateWithoutRoleInput[] | PositionRoleUncheckedCreateWithoutRoleInput[]
    connectOrCreate?: PositionRoleCreateOrConnectWithoutRoleInput | PositionRoleCreateOrConnectWithoutRoleInput[]
    upsert?: PositionRoleUpsertWithWhereUniqueWithoutRoleInput | PositionRoleUpsertWithWhereUniqueWithoutRoleInput[]
    createMany?: PositionRoleCreateManyRoleInputEnvelope
    set?: PositionRoleWhereUniqueInput | PositionRoleWhereUniqueInput[]
    disconnect?: PositionRoleWhereUniqueInput | PositionRoleWhereUniqueInput[]
    delete?: PositionRoleWhereUniqueInput | PositionRoleWhereUniqueInput[]
    connect?: PositionRoleWhereUniqueInput | PositionRoleWhereUniqueInput[]
    update?: PositionRoleUpdateWithWhereUniqueWithoutRoleInput | PositionRoleUpdateWithWhereUniqueWithoutRoleInput[]
    updateMany?: PositionRoleUpdateManyWithWhereWithoutRoleInput | PositionRoleUpdateManyWithWhereWithoutRoleInput[]
    deleteMany?: PositionRoleScalarWhereInput | PositionRoleScalarWhereInput[]
  }

  export type OrganizationRoleUpdateManyWithoutRoleNestedInput = {
    create?: XOR<OrganizationRoleCreateWithoutRoleInput, OrganizationRoleUncheckedCreateWithoutRoleInput> | OrganizationRoleCreateWithoutRoleInput[] | OrganizationRoleUncheckedCreateWithoutRoleInput[]
    connectOrCreate?: OrganizationRoleCreateOrConnectWithoutRoleInput | OrganizationRoleCreateOrConnectWithoutRoleInput[]
    upsert?: OrganizationRoleUpsertWithWhereUniqueWithoutRoleInput | OrganizationRoleUpsertWithWhereUniqueWithoutRoleInput[]
    createMany?: OrganizationRoleCreateManyRoleInputEnvelope
    set?: OrganizationRoleWhereUniqueInput | OrganizationRoleWhereUniqueInput[]
    disconnect?: OrganizationRoleWhereUniqueInput | OrganizationRoleWhereUniqueInput[]
    delete?: OrganizationRoleWhereUniqueInput | OrganizationRoleWhereUniqueInput[]
    connect?: OrganizationRoleWhereUniqueInput | OrganizationRoleWhereUniqueInput[]
    update?: OrganizationRoleUpdateWithWhereUniqueWithoutRoleInput | OrganizationRoleUpdateWithWhereUniqueWithoutRoleInput[]
    updateMany?: OrganizationRoleUpdateManyWithWhereWithoutRoleInput | OrganizationRoleUpdateManyWithWhereWithoutRoleInput[]
    deleteMany?: OrganizationRoleScalarWhereInput | OrganizationRoleScalarWhereInput[]
  }

  export type EmploymentRoleUpdateManyWithoutRoleNestedInput = {
    create?: XOR<EmploymentRoleCreateWithoutRoleInput, EmploymentRoleUncheckedCreateWithoutRoleInput> | EmploymentRoleCreateWithoutRoleInput[] | EmploymentRoleUncheckedCreateWithoutRoleInput[]
    connectOrCreate?: EmploymentRoleCreateOrConnectWithoutRoleInput | EmploymentRoleCreateOrConnectWithoutRoleInput[]
    upsert?: EmploymentRoleUpsertWithWhereUniqueWithoutRoleInput | EmploymentRoleUpsertWithWhereUniqueWithoutRoleInput[]
    createMany?: EmploymentRoleCreateManyRoleInputEnvelope
    set?: EmploymentRoleWhereUniqueInput | EmploymentRoleWhereUniqueInput[]
    disconnect?: EmploymentRoleWhereUniqueInput | EmploymentRoleWhereUniqueInput[]
    delete?: EmploymentRoleWhereUniqueInput | EmploymentRoleWhereUniqueInput[]
    connect?: EmploymentRoleWhereUniqueInput | EmploymentRoleWhereUniqueInput[]
    update?: EmploymentRoleUpdateWithWhereUniqueWithoutRoleInput | EmploymentRoleUpdateWithWhereUniqueWithoutRoleInput[]
    updateMany?: EmploymentRoleUpdateManyWithWhereWithoutRoleInput | EmploymentRoleUpdateManyWithWhereWithoutRoleInput[]
    deleteMany?: EmploymentRoleScalarWhereInput | EmploymentRoleScalarWhereInput[]
  }

  export type RolePrivilegeUpdateManyWithoutRoleNestedInput = {
    create?: XOR<RolePrivilegeCreateWithoutRoleInput, RolePrivilegeUncheckedCreateWithoutRoleInput> | RolePrivilegeCreateWithoutRoleInput[] | RolePrivilegeUncheckedCreateWithoutRoleInput[]
    connectOrCreate?: RolePrivilegeCreateOrConnectWithoutRoleInput | RolePrivilegeCreateOrConnectWithoutRoleInput[]
    upsert?: RolePrivilegeUpsertWithWhereUniqueWithoutRoleInput | RolePrivilegeUpsertWithWhereUniqueWithoutRoleInput[]
    createMany?: RolePrivilegeCreateManyRoleInputEnvelope
    set?: RolePrivilegeWhereUniqueInput | RolePrivilegeWhereUniqueInput[]
    disconnect?: RolePrivilegeWhereUniqueInput | RolePrivilegeWhereUniqueInput[]
    delete?: RolePrivilegeWhereUniqueInput | RolePrivilegeWhereUniqueInput[]
    connect?: RolePrivilegeWhereUniqueInput | RolePrivilegeWhereUniqueInput[]
    update?: RolePrivilegeUpdateWithWhereUniqueWithoutRoleInput | RolePrivilegeUpdateWithWhereUniqueWithoutRoleInput[]
    updateMany?: RolePrivilegeUpdateManyWithWhereWithoutRoleInput | RolePrivilegeUpdateManyWithWhereWithoutRoleInput[]
    deleteMany?: RolePrivilegeScalarWhereInput | RolePrivilegeScalarWhereInput[]
  }

  export type PositionRoleUncheckedUpdateManyWithoutRoleNestedInput = {
    create?: XOR<PositionRoleCreateWithoutRoleInput, PositionRoleUncheckedCreateWithoutRoleInput> | PositionRoleCreateWithoutRoleInput[] | PositionRoleUncheckedCreateWithoutRoleInput[]
    connectOrCreate?: PositionRoleCreateOrConnectWithoutRoleInput | PositionRoleCreateOrConnectWithoutRoleInput[]
    upsert?: PositionRoleUpsertWithWhereUniqueWithoutRoleInput | PositionRoleUpsertWithWhereUniqueWithoutRoleInput[]
    createMany?: PositionRoleCreateManyRoleInputEnvelope
    set?: PositionRoleWhereUniqueInput | PositionRoleWhereUniqueInput[]
    disconnect?: PositionRoleWhereUniqueInput | PositionRoleWhereUniqueInput[]
    delete?: PositionRoleWhereUniqueInput | PositionRoleWhereUniqueInput[]
    connect?: PositionRoleWhereUniqueInput | PositionRoleWhereUniqueInput[]
    update?: PositionRoleUpdateWithWhereUniqueWithoutRoleInput | PositionRoleUpdateWithWhereUniqueWithoutRoleInput[]
    updateMany?: PositionRoleUpdateManyWithWhereWithoutRoleInput | PositionRoleUpdateManyWithWhereWithoutRoleInput[]
    deleteMany?: PositionRoleScalarWhereInput | PositionRoleScalarWhereInput[]
  }

  export type OrganizationRoleUncheckedUpdateManyWithoutRoleNestedInput = {
    create?: XOR<OrganizationRoleCreateWithoutRoleInput, OrganizationRoleUncheckedCreateWithoutRoleInput> | OrganizationRoleCreateWithoutRoleInput[] | OrganizationRoleUncheckedCreateWithoutRoleInput[]
    connectOrCreate?: OrganizationRoleCreateOrConnectWithoutRoleInput | OrganizationRoleCreateOrConnectWithoutRoleInput[]
    upsert?: OrganizationRoleUpsertWithWhereUniqueWithoutRoleInput | OrganizationRoleUpsertWithWhereUniqueWithoutRoleInput[]
    createMany?: OrganizationRoleCreateManyRoleInputEnvelope
    set?: OrganizationRoleWhereUniqueInput | OrganizationRoleWhereUniqueInput[]
    disconnect?: OrganizationRoleWhereUniqueInput | OrganizationRoleWhereUniqueInput[]
    delete?: OrganizationRoleWhereUniqueInput | OrganizationRoleWhereUniqueInput[]
    connect?: OrganizationRoleWhereUniqueInput | OrganizationRoleWhereUniqueInput[]
    update?: OrganizationRoleUpdateWithWhereUniqueWithoutRoleInput | OrganizationRoleUpdateWithWhereUniqueWithoutRoleInput[]
    updateMany?: OrganizationRoleUpdateManyWithWhereWithoutRoleInput | OrganizationRoleUpdateManyWithWhereWithoutRoleInput[]
    deleteMany?: OrganizationRoleScalarWhereInput | OrganizationRoleScalarWhereInput[]
  }

  export type EmploymentRoleUncheckedUpdateManyWithoutRoleNestedInput = {
    create?: XOR<EmploymentRoleCreateWithoutRoleInput, EmploymentRoleUncheckedCreateWithoutRoleInput> | EmploymentRoleCreateWithoutRoleInput[] | EmploymentRoleUncheckedCreateWithoutRoleInput[]
    connectOrCreate?: EmploymentRoleCreateOrConnectWithoutRoleInput | EmploymentRoleCreateOrConnectWithoutRoleInput[]
    upsert?: EmploymentRoleUpsertWithWhereUniqueWithoutRoleInput | EmploymentRoleUpsertWithWhereUniqueWithoutRoleInput[]
    createMany?: EmploymentRoleCreateManyRoleInputEnvelope
    set?: EmploymentRoleWhereUniqueInput | EmploymentRoleWhereUniqueInput[]
    disconnect?: EmploymentRoleWhereUniqueInput | EmploymentRoleWhereUniqueInput[]
    delete?: EmploymentRoleWhereUniqueInput | EmploymentRoleWhereUniqueInput[]
    connect?: EmploymentRoleWhereUniqueInput | EmploymentRoleWhereUniqueInput[]
    update?: EmploymentRoleUpdateWithWhereUniqueWithoutRoleInput | EmploymentRoleUpdateWithWhereUniqueWithoutRoleInput[]
    updateMany?: EmploymentRoleUpdateManyWithWhereWithoutRoleInput | EmploymentRoleUpdateManyWithWhereWithoutRoleInput[]
    deleteMany?: EmploymentRoleScalarWhereInput | EmploymentRoleScalarWhereInput[]
  }

  export type RolePrivilegeUncheckedUpdateManyWithoutRoleNestedInput = {
    create?: XOR<RolePrivilegeCreateWithoutRoleInput, RolePrivilegeUncheckedCreateWithoutRoleInput> | RolePrivilegeCreateWithoutRoleInput[] | RolePrivilegeUncheckedCreateWithoutRoleInput[]
    connectOrCreate?: RolePrivilegeCreateOrConnectWithoutRoleInput | RolePrivilegeCreateOrConnectWithoutRoleInput[]
    upsert?: RolePrivilegeUpsertWithWhereUniqueWithoutRoleInput | RolePrivilegeUpsertWithWhereUniqueWithoutRoleInput[]
    createMany?: RolePrivilegeCreateManyRoleInputEnvelope
    set?: RolePrivilegeWhereUniqueInput | RolePrivilegeWhereUniqueInput[]
    disconnect?: RolePrivilegeWhereUniqueInput | RolePrivilegeWhereUniqueInput[]
    delete?: RolePrivilegeWhereUniqueInput | RolePrivilegeWhereUniqueInput[]
    connect?: RolePrivilegeWhereUniqueInput | RolePrivilegeWhereUniqueInput[]
    update?: RolePrivilegeUpdateWithWhereUniqueWithoutRoleInput | RolePrivilegeUpdateWithWhereUniqueWithoutRoleInput[]
    updateMany?: RolePrivilegeUpdateManyWithWhereWithoutRoleInput | RolePrivilegeUpdateManyWithWhereWithoutRoleInput[]
    deleteMany?: RolePrivilegeScalarWhereInput | RolePrivilegeScalarWhereInput[]
  }

  export type PositionCreateNestedOneWithoutRolesInput = {
    create?: XOR<PositionCreateWithoutRolesInput, PositionUncheckedCreateWithoutRolesInput>
    connectOrCreate?: PositionCreateOrConnectWithoutRolesInput
    connect?: PositionWhereUniqueInput
  }

  export type RoleCreateNestedOneWithoutPositionsInput = {
    create?: XOR<RoleCreateWithoutPositionsInput, RoleUncheckedCreateWithoutPositionsInput>
    connectOrCreate?: RoleCreateOrConnectWithoutPositionsInput
    connect?: RoleWhereUniqueInput
  }

  export type PositionUpdateOneRequiredWithoutRolesNestedInput = {
    create?: XOR<PositionCreateWithoutRolesInput, PositionUncheckedCreateWithoutRolesInput>
    connectOrCreate?: PositionCreateOrConnectWithoutRolesInput
    upsert?: PositionUpsertWithoutRolesInput
    connect?: PositionWhereUniqueInput
    update?: XOR<XOR<PositionUpdateToOneWithWhereWithoutRolesInput, PositionUpdateWithoutRolesInput>, PositionUncheckedUpdateWithoutRolesInput>
  }

  export type RoleUpdateOneRequiredWithoutPositionsNestedInput = {
    create?: XOR<RoleCreateWithoutPositionsInput, RoleUncheckedCreateWithoutPositionsInput>
    connectOrCreate?: RoleCreateOrConnectWithoutPositionsInput
    upsert?: RoleUpsertWithoutPositionsInput
    connect?: RoleWhereUniqueInput
    update?: XOR<XOR<RoleUpdateToOneWithWhereWithoutPositionsInput, RoleUpdateWithoutPositionsInput>, RoleUncheckedUpdateWithoutPositionsInput>
  }

  export type EmploymentCreateNestedOneWithoutRolesInput = {
    create?: XOR<EmploymentCreateWithoutRolesInput, EmploymentUncheckedCreateWithoutRolesInput>
    connectOrCreate?: EmploymentCreateOrConnectWithoutRolesInput
    connect?: EmploymentWhereUniqueInput
  }

  export type RoleCreateNestedOneWithoutEmploymentsInput = {
    create?: XOR<RoleCreateWithoutEmploymentsInput, RoleUncheckedCreateWithoutEmploymentsInput>
    connectOrCreate?: RoleCreateOrConnectWithoutEmploymentsInput
    connect?: RoleWhereUniqueInput
  }

  export type EmploymentUpdateOneRequiredWithoutRolesNestedInput = {
    create?: XOR<EmploymentCreateWithoutRolesInput, EmploymentUncheckedCreateWithoutRolesInput>
    connectOrCreate?: EmploymentCreateOrConnectWithoutRolesInput
    upsert?: EmploymentUpsertWithoutRolesInput
    connect?: EmploymentWhereUniqueInput
    update?: XOR<XOR<EmploymentUpdateToOneWithWhereWithoutRolesInput, EmploymentUpdateWithoutRolesInput>, EmploymentUncheckedUpdateWithoutRolesInput>
  }

  export type RoleUpdateOneRequiredWithoutEmploymentsNestedInput = {
    create?: XOR<RoleCreateWithoutEmploymentsInput, RoleUncheckedCreateWithoutEmploymentsInput>
    connectOrCreate?: RoleCreateOrConnectWithoutEmploymentsInput
    upsert?: RoleUpsertWithoutEmploymentsInput
    connect?: RoleWhereUniqueInput
    update?: XOR<XOR<RoleUpdateToOneWithWhereWithoutEmploymentsInput, RoleUpdateWithoutEmploymentsInput>, RoleUncheckedUpdateWithoutEmploymentsInput>
  }

  export type OrganizationCreateNestedOneWithoutRolesInput = {
    create?: XOR<OrganizationCreateWithoutRolesInput, OrganizationUncheckedCreateWithoutRolesInput>
    connectOrCreate?: OrganizationCreateOrConnectWithoutRolesInput
    connect?: OrganizationWhereUniqueInput
  }

  export type RoleCreateNestedOneWithoutOrganizationsInput = {
    create?: XOR<RoleCreateWithoutOrganizationsInput, RoleUncheckedCreateWithoutOrganizationsInput>
    connectOrCreate?: RoleCreateOrConnectWithoutOrganizationsInput
    connect?: RoleWhereUniqueInput
  }

  export type OrganizationUpdateOneRequiredWithoutRolesNestedInput = {
    create?: XOR<OrganizationCreateWithoutRolesInput, OrganizationUncheckedCreateWithoutRolesInput>
    connectOrCreate?: OrganizationCreateOrConnectWithoutRolesInput
    upsert?: OrganizationUpsertWithoutRolesInput
    connect?: OrganizationWhereUniqueInput
    update?: XOR<XOR<OrganizationUpdateToOneWithWhereWithoutRolesInput, OrganizationUpdateWithoutRolesInput>, OrganizationUncheckedUpdateWithoutRolesInput>
  }

  export type RoleUpdateOneRequiredWithoutOrganizationsNestedInput = {
    create?: XOR<RoleCreateWithoutOrganizationsInput, RoleUncheckedCreateWithoutOrganizationsInput>
    connectOrCreate?: RoleCreateOrConnectWithoutOrganizationsInput
    upsert?: RoleUpsertWithoutOrganizationsInput
    connect?: RoleWhereUniqueInput
    update?: XOR<XOR<RoleUpdateToOneWithWhereWithoutOrganizationsInput, RoleUpdateWithoutOrganizationsInput>, RoleUncheckedUpdateWithoutOrganizationsInput>
  }

  export type PrivilegeCreateNestedManyWithoutObjectInput = {
    create?: XOR<PrivilegeCreateWithoutObjectInput, PrivilegeUncheckedCreateWithoutObjectInput> | PrivilegeCreateWithoutObjectInput[] | PrivilegeUncheckedCreateWithoutObjectInput[]
    connectOrCreate?: PrivilegeCreateOrConnectWithoutObjectInput | PrivilegeCreateOrConnectWithoutObjectInput[]
    createMany?: PrivilegeCreateManyObjectInputEnvelope
    connect?: PrivilegeWhereUniqueInput | PrivilegeWhereUniqueInput[]
  }

  export type PrivilegeUncheckedCreateNestedManyWithoutObjectInput = {
    create?: XOR<PrivilegeCreateWithoutObjectInput, PrivilegeUncheckedCreateWithoutObjectInput> | PrivilegeCreateWithoutObjectInput[] | PrivilegeUncheckedCreateWithoutObjectInput[]
    connectOrCreate?: PrivilegeCreateOrConnectWithoutObjectInput | PrivilegeCreateOrConnectWithoutObjectInput[]
    createMany?: PrivilegeCreateManyObjectInputEnvelope
    connect?: PrivilegeWhereUniqueInput | PrivilegeWhereUniqueInput[]
  }

  export type PrivilegeUpdateManyWithoutObjectNestedInput = {
    create?: XOR<PrivilegeCreateWithoutObjectInput, PrivilegeUncheckedCreateWithoutObjectInput> | PrivilegeCreateWithoutObjectInput[] | PrivilegeUncheckedCreateWithoutObjectInput[]
    connectOrCreate?: PrivilegeCreateOrConnectWithoutObjectInput | PrivilegeCreateOrConnectWithoutObjectInput[]
    upsert?: PrivilegeUpsertWithWhereUniqueWithoutObjectInput | PrivilegeUpsertWithWhereUniqueWithoutObjectInput[]
    createMany?: PrivilegeCreateManyObjectInputEnvelope
    set?: PrivilegeWhereUniqueInput | PrivilegeWhereUniqueInput[]
    disconnect?: PrivilegeWhereUniqueInput | PrivilegeWhereUniqueInput[]
    delete?: PrivilegeWhereUniqueInput | PrivilegeWhereUniqueInput[]
    connect?: PrivilegeWhereUniqueInput | PrivilegeWhereUniqueInput[]
    update?: PrivilegeUpdateWithWhereUniqueWithoutObjectInput | PrivilegeUpdateWithWhereUniqueWithoutObjectInput[]
    updateMany?: PrivilegeUpdateManyWithWhereWithoutObjectInput | PrivilegeUpdateManyWithWhereWithoutObjectInput[]
    deleteMany?: PrivilegeScalarWhereInput | PrivilegeScalarWhereInput[]
  }

  export type PrivilegeUncheckedUpdateManyWithoutObjectNestedInput = {
    create?: XOR<PrivilegeCreateWithoutObjectInput, PrivilegeUncheckedCreateWithoutObjectInput> | PrivilegeCreateWithoutObjectInput[] | PrivilegeUncheckedCreateWithoutObjectInput[]
    connectOrCreate?: PrivilegeCreateOrConnectWithoutObjectInput | PrivilegeCreateOrConnectWithoutObjectInput[]
    upsert?: PrivilegeUpsertWithWhereUniqueWithoutObjectInput | PrivilegeUpsertWithWhereUniqueWithoutObjectInput[]
    createMany?: PrivilegeCreateManyObjectInputEnvelope
    set?: PrivilegeWhereUniqueInput | PrivilegeWhereUniqueInput[]
    disconnect?: PrivilegeWhereUniqueInput | PrivilegeWhereUniqueInput[]
    delete?: PrivilegeWhereUniqueInput | PrivilegeWhereUniqueInput[]
    connect?: PrivilegeWhereUniqueInput | PrivilegeWhereUniqueInput[]
    update?: PrivilegeUpdateWithWhereUniqueWithoutObjectInput | PrivilegeUpdateWithWhereUniqueWithoutObjectInput[]
    updateMany?: PrivilegeUpdateManyWithWhereWithoutObjectInput | PrivilegeUpdateManyWithWhereWithoutObjectInput[]
    deleteMany?: PrivilegeScalarWhereInput | PrivilegeScalarWhereInput[]
  }

  export type RolePrivilegeCreateNestedManyWithoutPrivilegeInput = {
    create?: XOR<RolePrivilegeCreateWithoutPrivilegeInput, RolePrivilegeUncheckedCreateWithoutPrivilegeInput> | RolePrivilegeCreateWithoutPrivilegeInput[] | RolePrivilegeUncheckedCreateWithoutPrivilegeInput[]
    connectOrCreate?: RolePrivilegeCreateOrConnectWithoutPrivilegeInput | RolePrivilegeCreateOrConnectWithoutPrivilegeInput[]
    createMany?: RolePrivilegeCreateManyPrivilegeInputEnvelope
    connect?: RolePrivilegeWhereUniqueInput | RolePrivilegeWhereUniqueInput[]
  }

  export type AuthObjectCreateNestedOneWithoutPrivilegesInput = {
    create?: XOR<AuthObjectCreateWithoutPrivilegesInput, AuthObjectUncheckedCreateWithoutPrivilegesInput>
    connectOrCreate?: AuthObjectCreateOrConnectWithoutPrivilegesInput
    connect?: AuthObjectWhereUniqueInput
  }

  export type RolePrivilegeUncheckedCreateNestedManyWithoutPrivilegeInput = {
    create?: XOR<RolePrivilegeCreateWithoutPrivilegeInput, RolePrivilegeUncheckedCreateWithoutPrivilegeInput> | RolePrivilegeCreateWithoutPrivilegeInput[] | RolePrivilegeUncheckedCreateWithoutPrivilegeInput[]
    connectOrCreate?: RolePrivilegeCreateOrConnectWithoutPrivilegeInput | RolePrivilegeCreateOrConnectWithoutPrivilegeInput[]
    createMany?: RolePrivilegeCreateManyPrivilegeInputEnvelope
    connect?: RolePrivilegeWhereUniqueInput | RolePrivilegeWhereUniqueInput[]
  }

  export type RolePrivilegeUpdateManyWithoutPrivilegeNestedInput = {
    create?: XOR<RolePrivilegeCreateWithoutPrivilegeInput, RolePrivilegeUncheckedCreateWithoutPrivilegeInput> | RolePrivilegeCreateWithoutPrivilegeInput[] | RolePrivilegeUncheckedCreateWithoutPrivilegeInput[]
    connectOrCreate?: RolePrivilegeCreateOrConnectWithoutPrivilegeInput | RolePrivilegeCreateOrConnectWithoutPrivilegeInput[]
    upsert?: RolePrivilegeUpsertWithWhereUniqueWithoutPrivilegeInput | RolePrivilegeUpsertWithWhereUniqueWithoutPrivilegeInput[]
    createMany?: RolePrivilegeCreateManyPrivilegeInputEnvelope
    set?: RolePrivilegeWhereUniqueInput | RolePrivilegeWhereUniqueInput[]
    disconnect?: RolePrivilegeWhereUniqueInput | RolePrivilegeWhereUniqueInput[]
    delete?: RolePrivilegeWhereUniqueInput | RolePrivilegeWhereUniqueInput[]
    connect?: RolePrivilegeWhereUniqueInput | RolePrivilegeWhereUniqueInput[]
    update?: RolePrivilegeUpdateWithWhereUniqueWithoutPrivilegeInput | RolePrivilegeUpdateWithWhereUniqueWithoutPrivilegeInput[]
    updateMany?: RolePrivilegeUpdateManyWithWhereWithoutPrivilegeInput | RolePrivilegeUpdateManyWithWhereWithoutPrivilegeInput[]
    deleteMany?: RolePrivilegeScalarWhereInput | RolePrivilegeScalarWhereInput[]
  }

  export type AuthObjectUpdateOneRequiredWithoutPrivilegesNestedInput = {
    create?: XOR<AuthObjectCreateWithoutPrivilegesInput, AuthObjectUncheckedCreateWithoutPrivilegesInput>
    connectOrCreate?: AuthObjectCreateOrConnectWithoutPrivilegesInput
    upsert?: AuthObjectUpsertWithoutPrivilegesInput
    connect?: AuthObjectWhereUniqueInput
    update?: XOR<XOR<AuthObjectUpdateToOneWithWhereWithoutPrivilegesInput, AuthObjectUpdateWithoutPrivilegesInput>, AuthObjectUncheckedUpdateWithoutPrivilegesInput>
  }

  export type RolePrivilegeUncheckedUpdateManyWithoutPrivilegeNestedInput = {
    create?: XOR<RolePrivilegeCreateWithoutPrivilegeInput, RolePrivilegeUncheckedCreateWithoutPrivilegeInput> | RolePrivilegeCreateWithoutPrivilegeInput[] | RolePrivilegeUncheckedCreateWithoutPrivilegeInput[]
    connectOrCreate?: RolePrivilegeCreateOrConnectWithoutPrivilegeInput | RolePrivilegeCreateOrConnectWithoutPrivilegeInput[]
    upsert?: RolePrivilegeUpsertWithWhereUniqueWithoutPrivilegeInput | RolePrivilegeUpsertWithWhereUniqueWithoutPrivilegeInput[]
    createMany?: RolePrivilegeCreateManyPrivilegeInputEnvelope
    set?: RolePrivilegeWhereUniqueInput | RolePrivilegeWhereUniqueInput[]
    disconnect?: RolePrivilegeWhereUniqueInput | RolePrivilegeWhereUniqueInput[]
    delete?: RolePrivilegeWhereUniqueInput | RolePrivilegeWhereUniqueInput[]
    connect?: RolePrivilegeWhereUniqueInput | RolePrivilegeWhereUniqueInput[]
    update?: RolePrivilegeUpdateWithWhereUniqueWithoutPrivilegeInput | RolePrivilegeUpdateWithWhereUniqueWithoutPrivilegeInput[]
    updateMany?: RolePrivilegeUpdateManyWithWhereWithoutPrivilegeInput | RolePrivilegeUpdateManyWithWhereWithoutPrivilegeInput[]
    deleteMany?: RolePrivilegeScalarWhereInput | RolePrivilegeScalarWhereInput[]
  }

  export type UserCreateNestedOneWithoutDelegationToInput = {
    create?: XOR<UserCreateWithoutDelegationToInput, UserUncheckedCreateWithoutDelegationToInput>
    connectOrCreate?: UserCreateOrConnectWithoutDelegationToInput
    connect?: UserWhereUniqueInput
  }

  export type UserCreateNestedOneWithoutDelegationFromInput = {
    create?: XOR<UserCreateWithoutDelegationFromInput, UserUncheckedCreateWithoutDelegationFromInput>
    connectOrCreate?: UserCreateOrConnectWithoutDelegationFromInput
    connect?: UserWhereUniqueInput
  }

  export type DelegationDetailCreateNestedManyWithoutDelegationInput = {
    create?: XOR<DelegationDetailCreateWithoutDelegationInput, DelegationDetailUncheckedCreateWithoutDelegationInput> | DelegationDetailCreateWithoutDelegationInput[] | DelegationDetailUncheckedCreateWithoutDelegationInput[]
    connectOrCreate?: DelegationDetailCreateOrConnectWithoutDelegationInput | DelegationDetailCreateOrConnectWithoutDelegationInput[]
    createMany?: DelegationDetailCreateManyDelegationInputEnvelope
    connect?: DelegationDetailWhereUniqueInput | DelegationDetailWhereUniqueInput[]
  }

  export type DelegationDetailUncheckedCreateNestedManyWithoutDelegationInput = {
    create?: XOR<DelegationDetailCreateWithoutDelegationInput, DelegationDetailUncheckedCreateWithoutDelegationInput> | DelegationDetailCreateWithoutDelegationInput[] | DelegationDetailUncheckedCreateWithoutDelegationInput[]
    connectOrCreate?: DelegationDetailCreateOrConnectWithoutDelegationInput | DelegationDetailCreateOrConnectWithoutDelegationInput[]
    createMany?: DelegationDetailCreateManyDelegationInputEnvelope
    connect?: DelegationDetailWhereUniqueInput | DelegationDetailWhereUniqueInput[]
  }

  export type UserUpdateOneRequiredWithoutDelegationToNestedInput = {
    create?: XOR<UserCreateWithoutDelegationToInput, UserUncheckedCreateWithoutDelegationToInput>
    connectOrCreate?: UserCreateOrConnectWithoutDelegationToInput
    upsert?: UserUpsertWithoutDelegationToInput
    connect?: UserWhereUniqueInput
    update?: XOR<XOR<UserUpdateToOneWithWhereWithoutDelegationToInput, UserUpdateWithoutDelegationToInput>, UserUncheckedUpdateWithoutDelegationToInput>
  }

  export type UserUpdateOneRequiredWithoutDelegationFromNestedInput = {
    create?: XOR<UserCreateWithoutDelegationFromInput, UserUncheckedCreateWithoutDelegationFromInput>
    connectOrCreate?: UserCreateOrConnectWithoutDelegationFromInput
    upsert?: UserUpsertWithoutDelegationFromInput
    connect?: UserWhereUniqueInput
    update?: XOR<XOR<UserUpdateToOneWithWhereWithoutDelegationFromInput, UserUpdateWithoutDelegationFromInput>, UserUncheckedUpdateWithoutDelegationFromInput>
  }

  export type DelegationDetailUpdateManyWithoutDelegationNestedInput = {
    create?: XOR<DelegationDetailCreateWithoutDelegationInput, DelegationDetailUncheckedCreateWithoutDelegationInput> | DelegationDetailCreateWithoutDelegationInput[] | DelegationDetailUncheckedCreateWithoutDelegationInput[]
    connectOrCreate?: DelegationDetailCreateOrConnectWithoutDelegationInput | DelegationDetailCreateOrConnectWithoutDelegationInput[]
    upsert?: DelegationDetailUpsertWithWhereUniqueWithoutDelegationInput | DelegationDetailUpsertWithWhereUniqueWithoutDelegationInput[]
    createMany?: DelegationDetailCreateManyDelegationInputEnvelope
    set?: DelegationDetailWhereUniqueInput | DelegationDetailWhereUniqueInput[]
    disconnect?: DelegationDetailWhereUniqueInput | DelegationDetailWhereUniqueInput[]
    delete?: DelegationDetailWhereUniqueInput | DelegationDetailWhereUniqueInput[]
    connect?: DelegationDetailWhereUniqueInput | DelegationDetailWhereUniqueInput[]
    update?: DelegationDetailUpdateWithWhereUniqueWithoutDelegationInput | DelegationDetailUpdateWithWhereUniqueWithoutDelegationInput[]
    updateMany?: DelegationDetailUpdateManyWithWhereWithoutDelegationInput | DelegationDetailUpdateManyWithWhereWithoutDelegationInput[]
    deleteMany?: DelegationDetailScalarWhereInput | DelegationDetailScalarWhereInput[]
  }

  export type DelegationDetailUncheckedUpdateManyWithoutDelegationNestedInput = {
    create?: XOR<DelegationDetailCreateWithoutDelegationInput, DelegationDetailUncheckedCreateWithoutDelegationInput> | DelegationDetailCreateWithoutDelegationInput[] | DelegationDetailUncheckedCreateWithoutDelegationInput[]
    connectOrCreate?: DelegationDetailCreateOrConnectWithoutDelegationInput | DelegationDetailCreateOrConnectWithoutDelegationInput[]
    upsert?: DelegationDetailUpsertWithWhereUniqueWithoutDelegationInput | DelegationDetailUpsertWithWhereUniqueWithoutDelegationInput[]
    createMany?: DelegationDetailCreateManyDelegationInputEnvelope
    set?: DelegationDetailWhereUniqueInput | DelegationDetailWhereUniqueInput[]
    disconnect?: DelegationDetailWhereUniqueInput | DelegationDetailWhereUniqueInput[]
    delete?: DelegationDetailWhereUniqueInput | DelegationDetailWhereUniqueInput[]
    connect?: DelegationDetailWhereUniqueInput | DelegationDetailWhereUniqueInput[]
    update?: DelegationDetailUpdateWithWhereUniqueWithoutDelegationInput | DelegationDetailUpdateWithWhereUniqueWithoutDelegationInput[]
    updateMany?: DelegationDetailUpdateManyWithWhereWithoutDelegationInput | DelegationDetailUpdateManyWithWhereWithoutDelegationInput[]
    deleteMany?: DelegationDetailScalarWhereInput | DelegationDetailScalarWhereInput[]
  }

  export type PrivilegeDelegationCreateNestedOneWithoutDelegationDetailsInput = {
    create?: XOR<PrivilegeDelegationCreateWithoutDelegationDetailsInput, PrivilegeDelegationUncheckedCreateWithoutDelegationDetailsInput>
    connectOrCreate?: PrivilegeDelegationCreateOrConnectWithoutDelegationDetailsInput
    connect?: PrivilegeDelegationWhereUniqueInput
  }

  export type PrivilegeDelegationUpdateOneRequiredWithoutDelegationDetailsNestedInput = {
    create?: XOR<PrivilegeDelegationCreateWithoutDelegationDetailsInput, PrivilegeDelegationUncheckedCreateWithoutDelegationDetailsInput>
    connectOrCreate?: PrivilegeDelegationCreateOrConnectWithoutDelegationDetailsInput
    upsert?: PrivilegeDelegationUpsertWithoutDelegationDetailsInput
    connect?: PrivilegeDelegationWhereUniqueInput
    update?: XOR<XOR<PrivilegeDelegationUpdateToOneWithWhereWithoutDelegationDetailsInput, PrivilegeDelegationUpdateWithoutDelegationDetailsInput>, PrivilegeDelegationUncheckedUpdateWithoutDelegationDetailsInput>
  }

  export type RoleCreateNestedOneWithoutPrivilegesInput = {
    create?: XOR<RoleCreateWithoutPrivilegesInput, RoleUncheckedCreateWithoutPrivilegesInput>
    connectOrCreate?: RoleCreateOrConnectWithoutPrivilegesInput
    connect?: RoleWhereUniqueInput
  }

  export type PrivilegeCreateNestedOneWithoutRolesInput = {
    create?: XOR<PrivilegeCreateWithoutRolesInput, PrivilegeUncheckedCreateWithoutRolesInput>
    connectOrCreate?: PrivilegeCreateOrConnectWithoutRolesInput
    connect?: PrivilegeWhereUniqueInput
  }

  export type RoleUpdateOneRequiredWithoutPrivilegesNestedInput = {
    create?: XOR<RoleCreateWithoutPrivilegesInput, RoleUncheckedCreateWithoutPrivilegesInput>
    connectOrCreate?: RoleCreateOrConnectWithoutPrivilegesInput
    upsert?: RoleUpsertWithoutPrivilegesInput
    connect?: RoleWhereUniqueInput
    update?: XOR<XOR<RoleUpdateToOneWithWhereWithoutPrivilegesInput, RoleUpdateWithoutPrivilegesInput>, RoleUncheckedUpdateWithoutPrivilegesInput>
  }

  export type PrivilegeUpdateOneRequiredWithoutRolesNestedInput = {
    create?: XOR<PrivilegeCreateWithoutRolesInput, PrivilegeUncheckedCreateWithoutRolesInput>
    connectOrCreate?: PrivilegeCreateOrConnectWithoutRolesInput
    upsert?: PrivilegeUpsertWithoutRolesInput
    connect?: PrivilegeWhereUniqueInput
    update?: XOR<XOR<PrivilegeUpdateToOneWithWhereWithoutRolesInput, PrivilegeUpdateWithoutRolesInput>, PrivilegeUncheckedUpdateWithoutRolesInput>
  }

  export type NestedIntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type NestedStringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[]
    notIn?: string[]
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    search?: string
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type NestedStringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | null
    notIn?: string[] | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    search?: string
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type NestedBoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }

  export type NestedDateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[]
    notIn?: Date[] | string[]
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type NestedIntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type NestedFloatFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[]
    notIn?: number[]
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatFilter<$PrismaModel> | number
  }

  export type NestedStringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[]
    notIn?: string[]
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    search?: string
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type NestedStringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | null
    notIn?: string[] | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    search?: string
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type NestedIntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | null
    notIn?: number[] | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableFilter<$PrismaModel> | number | null
  }

  export type NestedBoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }

  export type NestedDateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[]
    notIn?: Date[] | string[]
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }
  export type NestedJsonNullableFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<NestedJsonNullableFilterBase<$PrismaModel>>, Exclude<keyof Required<NestedJsonNullableFilterBase<$PrismaModel>>, 'path'>>,
        Required<NestedJsonNullableFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<NestedJsonNullableFilterBase<$PrismaModel>>, 'path'>>

  export type NestedJsonNullableFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue
    lte?: InputJsonValue
    gt?: InputJsonValue
    gte?: InputJsonValue
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type EmploymentCreateWithoutUserInput = {
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    deptartment: OrganizationCreateNestedOneWithoutDeptEmploymentsInput
    company: OrganizationCreateNestedOneWithoutCompEmploymentsInput
    position: PositionCreateNestedOneWithoutEmploymentsInput
    roles?: EmploymentRoleCreateNestedManyWithoutEmploymentInput
  }

  export type EmploymentUncheckedCreateWithoutUserInput = {
    id?: number
    posId: number
    deptId: number
    compId: number
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    roles?: EmploymentRoleUncheckedCreateNestedManyWithoutEmploymentInput
  }

  export type EmploymentCreateOrConnectWithoutUserInput = {
    where: EmploymentWhereUniqueInput
    create: XOR<EmploymentCreateWithoutUserInput, EmploymentUncheckedCreateWithoutUserInput>
  }

  export type EmploymentCreateManyUserInputEnvelope = {
    data: EmploymentCreateManyUserInput | EmploymentCreateManyUserInput[]
    skipDuplicates?: boolean
  }

  export type PrivilegeDelegationCreateWithoutDelegatorUserInput = {
    startTime: Date | string
    endTime: Date | string
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    delegateeUser: UserCreateNestedOneWithoutDelegationFromInput
    delegationDetails?: DelegationDetailCreateNestedManyWithoutDelegationInput
  }

  export type PrivilegeDelegationUncheckedCreateWithoutDelegatorUserInput = {
    id?: number
    delegateeUserId: number
    startTime: Date | string
    endTime: Date | string
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    delegationDetails?: DelegationDetailUncheckedCreateNestedManyWithoutDelegationInput
  }

  export type PrivilegeDelegationCreateOrConnectWithoutDelegatorUserInput = {
    where: PrivilegeDelegationWhereUniqueInput
    create: XOR<PrivilegeDelegationCreateWithoutDelegatorUserInput, PrivilegeDelegationUncheckedCreateWithoutDelegatorUserInput>
  }

  export type PrivilegeDelegationCreateManyDelegatorUserInputEnvelope = {
    data: PrivilegeDelegationCreateManyDelegatorUserInput | PrivilegeDelegationCreateManyDelegatorUserInput[]
    skipDuplicates?: boolean
  }

  export type PrivilegeDelegationCreateWithoutDelegateeUserInput = {
    startTime: Date | string
    endTime: Date | string
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    delegatorUser: UserCreateNestedOneWithoutDelegationToInput
    delegationDetails?: DelegationDetailCreateNestedManyWithoutDelegationInput
  }

  export type PrivilegeDelegationUncheckedCreateWithoutDelegateeUserInput = {
    id?: number
    delegatorUserId: number
    startTime: Date | string
    endTime: Date | string
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    delegationDetails?: DelegationDetailUncheckedCreateNestedManyWithoutDelegationInput
  }

  export type PrivilegeDelegationCreateOrConnectWithoutDelegateeUserInput = {
    where: PrivilegeDelegationWhereUniqueInput
    create: XOR<PrivilegeDelegationCreateWithoutDelegateeUserInput, PrivilegeDelegationUncheckedCreateWithoutDelegateeUserInput>
  }

  export type PrivilegeDelegationCreateManyDelegateeUserInputEnvelope = {
    data: PrivilegeDelegationCreateManyDelegateeUserInput | PrivilegeDelegationCreateManyDelegateeUserInput[]
    skipDuplicates?: boolean
  }

  export type EmploymentUpsertWithWhereUniqueWithoutUserInput = {
    where: EmploymentWhereUniqueInput
    update: XOR<EmploymentUpdateWithoutUserInput, EmploymentUncheckedUpdateWithoutUserInput>
    create: XOR<EmploymentCreateWithoutUserInput, EmploymentUncheckedCreateWithoutUserInput>
  }

  export type EmploymentUpdateWithWhereUniqueWithoutUserInput = {
    where: EmploymentWhereUniqueInput
    data: XOR<EmploymentUpdateWithoutUserInput, EmploymentUncheckedUpdateWithoutUserInput>
  }

  export type EmploymentUpdateManyWithWhereWithoutUserInput = {
    where: EmploymentScalarWhereInput
    data: XOR<EmploymentUpdateManyMutationInput, EmploymentUncheckedUpdateManyWithoutUserInput>
  }

  export type EmploymentScalarWhereInput = {
    AND?: EmploymentScalarWhereInput | EmploymentScalarWhereInput[]
    OR?: EmploymentScalarWhereInput[]
    NOT?: EmploymentScalarWhereInput | EmploymentScalarWhereInput[]
    id?: IntFilter<"Employment"> | number
    userId?: IntFilter<"Employment"> | number
    posId?: IntFilter<"Employment"> | number
    deptId?: IntFilter<"Employment"> | number
    compId?: IntFilter<"Employment"> | number
    status?: IntFilter<"Employment"> | number
    description?: StringNullableFilter<"Employment"> | string | null
    isDelete?: BoolFilter<"Employment"> | boolean
    createTime?: DateTimeFilter<"Employment"> | Date | string
    updateTime?: DateTimeFilter<"Employment"> | Date | string
  }

  export type PrivilegeDelegationUpsertWithWhereUniqueWithoutDelegatorUserInput = {
    where: PrivilegeDelegationWhereUniqueInput
    update: XOR<PrivilegeDelegationUpdateWithoutDelegatorUserInput, PrivilegeDelegationUncheckedUpdateWithoutDelegatorUserInput>
    create: XOR<PrivilegeDelegationCreateWithoutDelegatorUserInput, PrivilegeDelegationUncheckedCreateWithoutDelegatorUserInput>
  }

  export type PrivilegeDelegationUpdateWithWhereUniqueWithoutDelegatorUserInput = {
    where: PrivilegeDelegationWhereUniqueInput
    data: XOR<PrivilegeDelegationUpdateWithoutDelegatorUserInput, PrivilegeDelegationUncheckedUpdateWithoutDelegatorUserInput>
  }

  export type PrivilegeDelegationUpdateManyWithWhereWithoutDelegatorUserInput = {
    where: PrivilegeDelegationScalarWhereInput
    data: XOR<PrivilegeDelegationUpdateManyMutationInput, PrivilegeDelegationUncheckedUpdateManyWithoutDelegatorUserInput>
  }

  export type PrivilegeDelegationScalarWhereInput = {
    AND?: PrivilegeDelegationScalarWhereInput | PrivilegeDelegationScalarWhereInput[]
    OR?: PrivilegeDelegationScalarWhereInput[]
    NOT?: PrivilegeDelegationScalarWhereInput | PrivilegeDelegationScalarWhereInput[]
    id?: IntFilter<"PrivilegeDelegation"> | number
    delegatorUserId?: IntFilter<"PrivilegeDelegation"> | number
    delegateeUserId?: IntFilter<"PrivilegeDelegation"> | number
    startTime?: DateTimeFilter<"PrivilegeDelegation"> | Date | string
    endTime?: DateTimeFilter<"PrivilegeDelegation"> | Date | string
    status?: IntFilter<"PrivilegeDelegation"> | number
    description?: StringNullableFilter<"PrivilegeDelegation"> | string | null
    isDelete?: BoolFilter<"PrivilegeDelegation"> | boolean
    createTime?: DateTimeFilter<"PrivilegeDelegation"> | Date | string
    updateTime?: DateTimeFilter<"PrivilegeDelegation"> | Date | string
  }

  export type PrivilegeDelegationUpsertWithWhereUniqueWithoutDelegateeUserInput = {
    where: PrivilegeDelegationWhereUniqueInput
    update: XOR<PrivilegeDelegationUpdateWithoutDelegateeUserInput, PrivilegeDelegationUncheckedUpdateWithoutDelegateeUserInput>
    create: XOR<PrivilegeDelegationCreateWithoutDelegateeUserInput, PrivilegeDelegationUncheckedCreateWithoutDelegateeUserInput>
  }

  export type PrivilegeDelegationUpdateWithWhereUniqueWithoutDelegateeUserInput = {
    where: PrivilegeDelegationWhereUniqueInput
    data: XOR<PrivilegeDelegationUpdateWithoutDelegateeUserInput, PrivilegeDelegationUncheckedUpdateWithoutDelegateeUserInput>
  }

  export type PrivilegeDelegationUpdateManyWithWhereWithoutDelegateeUserInput = {
    where: PrivilegeDelegationScalarWhereInput
    data: XOR<PrivilegeDelegationUpdateManyMutationInput, PrivilegeDelegationUncheckedUpdateManyWithoutDelegateeUserInput>
  }

  export type EmploymentCreateWithoutDeptartmentInput = {
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    user: UserCreateNestedOneWithoutEmploymentsInput
    company: OrganizationCreateNestedOneWithoutCompEmploymentsInput
    position: PositionCreateNestedOneWithoutEmploymentsInput
    roles?: EmploymentRoleCreateNestedManyWithoutEmploymentInput
  }

  export type EmploymentUncheckedCreateWithoutDeptartmentInput = {
    id?: number
    userId: number
    posId: number
    compId: number
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    roles?: EmploymentRoleUncheckedCreateNestedManyWithoutEmploymentInput
  }

  export type EmploymentCreateOrConnectWithoutDeptartmentInput = {
    where: EmploymentWhereUniqueInput
    create: XOR<EmploymentCreateWithoutDeptartmentInput, EmploymentUncheckedCreateWithoutDeptartmentInput>
  }

  export type EmploymentCreateManyDeptartmentInputEnvelope = {
    data: EmploymentCreateManyDeptartmentInput | EmploymentCreateManyDeptartmentInput[]
    skipDuplicates?: boolean
  }

  export type EmploymentCreateWithoutCompanyInput = {
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    user: UserCreateNestedOneWithoutEmploymentsInput
    deptartment: OrganizationCreateNestedOneWithoutDeptEmploymentsInput
    position: PositionCreateNestedOneWithoutEmploymentsInput
    roles?: EmploymentRoleCreateNestedManyWithoutEmploymentInput
  }

  export type EmploymentUncheckedCreateWithoutCompanyInput = {
    id?: number
    userId: number
    posId: number
    deptId: number
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    roles?: EmploymentRoleUncheckedCreateNestedManyWithoutEmploymentInput
  }

  export type EmploymentCreateOrConnectWithoutCompanyInput = {
    where: EmploymentWhereUniqueInput
    create: XOR<EmploymentCreateWithoutCompanyInput, EmploymentUncheckedCreateWithoutCompanyInput>
  }

  export type EmploymentCreateManyCompanyInputEnvelope = {
    data: EmploymentCreateManyCompanyInput | EmploymentCreateManyCompanyInput[]
    skipDuplicates?: boolean
  }

  export type OrganizationRoleCreateWithoutOrganizationInput = {
    role: RoleCreateNestedOneWithoutOrganizationsInput
  }

  export type OrganizationRoleUncheckedCreateWithoutOrganizationInput = {
    roleId: number
  }

  export type OrganizationRoleCreateOrConnectWithoutOrganizationInput = {
    where: OrganizationRoleWhereUniqueInput
    create: XOR<OrganizationRoleCreateWithoutOrganizationInput, OrganizationRoleUncheckedCreateWithoutOrganizationInput>
  }

  export type OrganizationRoleCreateManyOrganizationInputEnvelope = {
    data: OrganizationRoleCreateManyOrganizationInput | OrganizationRoleCreateManyOrganizationInput[]
    skipDuplicates?: boolean
  }

  export type EmploymentUpsertWithWhereUniqueWithoutDeptartmentInput = {
    where: EmploymentWhereUniqueInput
    update: XOR<EmploymentUpdateWithoutDeptartmentInput, EmploymentUncheckedUpdateWithoutDeptartmentInput>
    create: XOR<EmploymentCreateWithoutDeptartmentInput, EmploymentUncheckedCreateWithoutDeptartmentInput>
  }

  export type EmploymentUpdateWithWhereUniqueWithoutDeptartmentInput = {
    where: EmploymentWhereUniqueInput
    data: XOR<EmploymentUpdateWithoutDeptartmentInput, EmploymentUncheckedUpdateWithoutDeptartmentInput>
  }

  export type EmploymentUpdateManyWithWhereWithoutDeptartmentInput = {
    where: EmploymentScalarWhereInput
    data: XOR<EmploymentUpdateManyMutationInput, EmploymentUncheckedUpdateManyWithoutDeptartmentInput>
  }

  export type EmploymentUpsertWithWhereUniqueWithoutCompanyInput = {
    where: EmploymentWhereUniqueInput
    update: XOR<EmploymentUpdateWithoutCompanyInput, EmploymentUncheckedUpdateWithoutCompanyInput>
    create: XOR<EmploymentCreateWithoutCompanyInput, EmploymentUncheckedCreateWithoutCompanyInput>
  }

  export type EmploymentUpdateWithWhereUniqueWithoutCompanyInput = {
    where: EmploymentWhereUniqueInput
    data: XOR<EmploymentUpdateWithoutCompanyInput, EmploymentUncheckedUpdateWithoutCompanyInput>
  }

  export type EmploymentUpdateManyWithWhereWithoutCompanyInput = {
    where: EmploymentScalarWhereInput
    data: XOR<EmploymentUpdateManyMutationInput, EmploymentUncheckedUpdateManyWithoutCompanyInput>
  }

  export type OrganizationRoleUpsertWithWhereUniqueWithoutOrganizationInput = {
    where: OrganizationRoleWhereUniqueInput
    update: XOR<OrganizationRoleUpdateWithoutOrganizationInput, OrganizationRoleUncheckedUpdateWithoutOrganizationInput>
    create: XOR<OrganizationRoleCreateWithoutOrganizationInput, OrganizationRoleUncheckedCreateWithoutOrganizationInput>
  }

  export type OrganizationRoleUpdateWithWhereUniqueWithoutOrganizationInput = {
    where: OrganizationRoleWhereUniqueInput
    data: XOR<OrganizationRoleUpdateWithoutOrganizationInput, OrganizationRoleUncheckedUpdateWithoutOrganizationInput>
  }

  export type OrganizationRoleUpdateManyWithWhereWithoutOrganizationInput = {
    where: OrganizationRoleScalarWhereInput
    data: XOR<OrganizationRoleUpdateManyMutationInput, OrganizationRoleUncheckedUpdateManyWithoutOrganizationInput>
  }

  export type OrganizationRoleScalarWhereInput = {
    AND?: OrganizationRoleScalarWhereInput | OrganizationRoleScalarWhereInput[]
    OR?: OrganizationRoleScalarWhereInput[]
    NOT?: OrganizationRoleScalarWhereInput | OrganizationRoleScalarWhereInput[]
    organizationId?: IntFilter<"OrganizationRole"> | number
    roleId?: IntFilter<"OrganizationRole"> | number
  }

  export type EmploymentCreateWithoutPositionInput = {
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    user: UserCreateNestedOneWithoutEmploymentsInput
    deptartment: OrganizationCreateNestedOneWithoutDeptEmploymentsInput
    company: OrganizationCreateNestedOneWithoutCompEmploymentsInput
    roles?: EmploymentRoleCreateNestedManyWithoutEmploymentInput
  }

  export type EmploymentUncheckedCreateWithoutPositionInput = {
    id?: number
    userId: number
    deptId: number
    compId: number
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    roles?: EmploymentRoleUncheckedCreateNestedManyWithoutEmploymentInput
  }

  export type EmploymentCreateOrConnectWithoutPositionInput = {
    where: EmploymentWhereUniqueInput
    create: XOR<EmploymentCreateWithoutPositionInput, EmploymentUncheckedCreateWithoutPositionInput>
  }

  export type EmploymentCreateManyPositionInputEnvelope = {
    data: EmploymentCreateManyPositionInput | EmploymentCreateManyPositionInput[]
    skipDuplicates?: boolean
  }

  export type PositionRoleCreateWithoutPositionInput = {
    role: RoleCreateNestedOneWithoutPositionsInput
  }

  export type PositionRoleUncheckedCreateWithoutPositionInput = {
    roleId: number
  }

  export type PositionRoleCreateOrConnectWithoutPositionInput = {
    where: PositionRoleWhereUniqueInput
    create: XOR<PositionRoleCreateWithoutPositionInput, PositionRoleUncheckedCreateWithoutPositionInput>
  }

  export type PositionRoleCreateManyPositionInputEnvelope = {
    data: PositionRoleCreateManyPositionInput | PositionRoleCreateManyPositionInput[]
    skipDuplicates?: boolean
  }

  export type EmploymentUpsertWithWhereUniqueWithoutPositionInput = {
    where: EmploymentWhereUniqueInput
    update: XOR<EmploymentUpdateWithoutPositionInput, EmploymentUncheckedUpdateWithoutPositionInput>
    create: XOR<EmploymentCreateWithoutPositionInput, EmploymentUncheckedCreateWithoutPositionInput>
  }

  export type EmploymentUpdateWithWhereUniqueWithoutPositionInput = {
    where: EmploymentWhereUniqueInput
    data: XOR<EmploymentUpdateWithoutPositionInput, EmploymentUncheckedUpdateWithoutPositionInput>
  }

  export type EmploymentUpdateManyWithWhereWithoutPositionInput = {
    where: EmploymentScalarWhereInput
    data: XOR<EmploymentUpdateManyMutationInput, EmploymentUncheckedUpdateManyWithoutPositionInput>
  }

  export type PositionRoleUpsertWithWhereUniqueWithoutPositionInput = {
    where: PositionRoleWhereUniqueInput
    update: XOR<PositionRoleUpdateWithoutPositionInput, PositionRoleUncheckedUpdateWithoutPositionInput>
    create: XOR<PositionRoleCreateWithoutPositionInput, PositionRoleUncheckedCreateWithoutPositionInput>
  }

  export type PositionRoleUpdateWithWhereUniqueWithoutPositionInput = {
    where: PositionRoleWhereUniqueInput
    data: XOR<PositionRoleUpdateWithoutPositionInput, PositionRoleUncheckedUpdateWithoutPositionInput>
  }

  export type PositionRoleUpdateManyWithWhereWithoutPositionInput = {
    where: PositionRoleScalarWhereInput
    data: XOR<PositionRoleUpdateManyMutationInput, PositionRoleUncheckedUpdateManyWithoutPositionInput>
  }

  export type PositionRoleScalarWhereInput = {
    AND?: PositionRoleScalarWhereInput | PositionRoleScalarWhereInput[]
    OR?: PositionRoleScalarWhereInput[]
    NOT?: PositionRoleScalarWhereInput | PositionRoleScalarWhereInput[]
    positionId?: IntFilter<"PositionRole"> | number
    roleId?: IntFilter<"PositionRole"> | number
  }

  export type UserCreateWithoutEmploymentsInput = {
    username: string
    name: string
    password?: string | null
    mobilePhone?: string | null
    userType?: string | null
    status?: number
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    delegationTo?: PrivilegeDelegationCreateNestedManyWithoutDelegatorUserInput
    delegationFrom?: PrivilegeDelegationCreateNestedManyWithoutDelegateeUserInput
  }

  export type UserUncheckedCreateWithoutEmploymentsInput = {
    id?: number
    username: string
    name: string
    password?: string | null
    mobilePhone?: string | null
    userType?: string | null
    status?: number
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    delegationTo?: PrivilegeDelegationUncheckedCreateNestedManyWithoutDelegatorUserInput
    delegationFrom?: PrivilegeDelegationUncheckedCreateNestedManyWithoutDelegateeUserInput
  }

  export type UserCreateOrConnectWithoutEmploymentsInput = {
    where: UserWhereUniqueInput
    create: XOR<UserCreateWithoutEmploymentsInput, UserUncheckedCreateWithoutEmploymentsInput>
  }

  export type OrganizationCreateWithoutDeptEmploymentsInput = {
    orgCode: string
    orgName: string
    parentId?: number
    businessParentId?: number
    level: number
    orgType: string
    orderNum?: number
    isVirtual?: boolean
    isEntity?: boolean
    status?: boolean
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    compEmployments?: EmploymentCreateNestedManyWithoutCompanyInput
    roles?: OrganizationRoleCreateNestedManyWithoutOrganizationInput
  }

  export type OrganizationUncheckedCreateWithoutDeptEmploymentsInput = {
    id?: number
    orgCode: string
    orgName: string
    parentId?: number
    businessParentId?: number
    level: number
    orgType: string
    orderNum?: number
    isVirtual?: boolean
    isEntity?: boolean
    status?: boolean
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    compEmployments?: EmploymentUncheckedCreateNestedManyWithoutCompanyInput
    roles?: OrganizationRoleUncheckedCreateNestedManyWithoutOrganizationInput
  }

  export type OrganizationCreateOrConnectWithoutDeptEmploymentsInput = {
    where: OrganizationWhereUniqueInput
    create: XOR<OrganizationCreateWithoutDeptEmploymentsInput, OrganizationUncheckedCreateWithoutDeptEmploymentsInput>
  }

  export type OrganizationCreateWithoutCompEmploymentsInput = {
    orgCode: string
    orgName: string
    parentId?: number
    businessParentId?: number
    level: number
    orgType: string
    orderNum?: number
    isVirtual?: boolean
    isEntity?: boolean
    status?: boolean
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    deptEmployments?: EmploymentCreateNestedManyWithoutDeptartmentInput
    roles?: OrganizationRoleCreateNestedManyWithoutOrganizationInput
  }

  export type OrganizationUncheckedCreateWithoutCompEmploymentsInput = {
    id?: number
    orgCode: string
    orgName: string
    parentId?: number
    businessParentId?: number
    level: number
    orgType: string
    orderNum?: number
    isVirtual?: boolean
    isEntity?: boolean
    status?: boolean
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    deptEmployments?: EmploymentUncheckedCreateNestedManyWithoutDeptartmentInput
    roles?: OrganizationRoleUncheckedCreateNestedManyWithoutOrganizationInput
  }

  export type OrganizationCreateOrConnectWithoutCompEmploymentsInput = {
    where: OrganizationWhereUniqueInput
    create: XOR<OrganizationCreateWithoutCompEmploymentsInput, OrganizationUncheckedCreateWithoutCompEmploymentsInput>
  }

  export type PositionCreateWithoutEmploymentsInput = {
    posCode: string
    posName: string
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    roles?: PositionRoleCreateNestedManyWithoutPositionInput
  }

  export type PositionUncheckedCreateWithoutEmploymentsInput = {
    id?: number
    posCode: string
    posName: string
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    roles?: PositionRoleUncheckedCreateNestedManyWithoutPositionInput
  }

  export type PositionCreateOrConnectWithoutEmploymentsInput = {
    where: PositionWhereUniqueInput
    create: XOR<PositionCreateWithoutEmploymentsInput, PositionUncheckedCreateWithoutEmploymentsInput>
  }

  export type EmploymentRoleCreateWithoutEmploymentInput = {
    role: RoleCreateNestedOneWithoutEmploymentsInput
  }

  export type EmploymentRoleUncheckedCreateWithoutEmploymentInput = {
    roleId: number
  }

  export type EmploymentRoleCreateOrConnectWithoutEmploymentInput = {
    where: EmploymentRoleWhereUniqueInput
    create: XOR<EmploymentRoleCreateWithoutEmploymentInput, EmploymentRoleUncheckedCreateWithoutEmploymentInput>
  }

  export type EmploymentRoleCreateManyEmploymentInputEnvelope = {
    data: EmploymentRoleCreateManyEmploymentInput | EmploymentRoleCreateManyEmploymentInput[]
    skipDuplicates?: boolean
  }

  export type UserUpsertWithoutEmploymentsInput = {
    update: XOR<UserUpdateWithoutEmploymentsInput, UserUncheckedUpdateWithoutEmploymentsInput>
    create: XOR<UserCreateWithoutEmploymentsInput, UserUncheckedCreateWithoutEmploymentsInput>
    where?: UserWhereInput
  }

  export type UserUpdateToOneWithWhereWithoutEmploymentsInput = {
    where?: UserWhereInput
    data: XOR<UserUpdateWithoutEmploymentsInput, UserUncheckedUpdateWithoutEmploymentsInput>
  }

  export type UserUpdateWithoutEmploymentsInput = {
    username?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    password?: NullableStringFieldUpdateOperationsInput | string | null
    mobilePhone?: NullableStringFieldUpdateOperationsInput | string | null
    userType?: NullableStringFieldUpdateOperationsInput | string | null
    status?: IntFieldUpdateOperationsInput | number
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    delegationTo?: PrivilegeDelegationUpdateManyWithoutDelegatorUserNestedInput
    delegationFrom?: PrivilegeDelegationUpdateManyWithoutDelegateeUserNestedInput
  }

  export type UserUncheckedUpdateWithoutEmploymentsInput = {
    id?: IntFieldUpdateOperationsInput | number
    username?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    password?: NullableStringFieldUpdateOperationsInput | string | null
    mobilePhone?: NullableStringFieldUpdateOperationsInput | string | null
    userType?: NullableStringFieldUpdateOperationsInput | string | null
    status?: IntFieldUpdateOperationsInput | number
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    delegationTo?: PrivilegeDelegationUncheckedUpdateManyWithoutDelegatorUserNestedInput
    delegationFrom?: PrivilegeDelegationUncheckedUpdateManyWithoutDelegateeUserNestedInput
  }

  export type OrganizationUpsertWithoutDeptEmploymentsInput = {
    update: XOR<OrganizationUpdateWithoutDeptEmploymentsInput, OrganizationUncheckedUpdateWithoutDeptEmploymentsInput>
    create: XOR<OrganizationCreateWithoutDeptEmploymentsInput, OrganizationUncheckedCreateWithoutDeptEmploymentsInput>
    where?: OrganizationWhereInput
  }

  export type OrganizationUpdateToOneWithWhereWithoutDeptEmploymentsInput = {
    where?: OrganizationWhereInput
    data: XOR<OrganizationUpdateWithoutDeptEmploymentsInput, OrganizationUncheckedUpdateWithoutDeptEmploymentsInput>
  }

  export type OrganizationUpdateWithoutDeptEmploymentsInput = {
    orgCode?: StringFieldUpdateOperationsInput | string
    orgName?: StringFieldUpdateOperationsInput | string
    parentId?: IntFieldUpdateOperationsInput | number
    businessParentId?: IntFieldUpdateOperationsInput | number
    level?: IntFieldUpdateOperationsInput | number
    orgType?: StringFieldUpdateOperationsInput | string
    orderNum?: IntFieldUpdateOperationsInput | number
    isVirtual?: BoolFieldUpdateOperationsInput | boolean
    isEntity?: BoolFieldUpdateOperationsInput | boolean
    status?: BoolFieldUpdateOperationsInput | boolean
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    compEmployments?: EmploymentUpdateManyWithoutCompanyNestedInput
    roles?: OrganizationRoleUpdateManyWithoutOrganizationNestedInput
  }

  export type OrganizationUncheckedUpdateWithoutDeptEmploymentsInput = {
    id?: IntFieldUpdateOperationsInput | number
    orgCode?: StringFieldUpdateOperationsInput | string
    orgName?: StringFieldUpdateOperationsInput | string
    parentId?: IntFieldUpdateOperationsInput | number
    businessParentId?: IntFieldUpdateOperationsInput | number
    level?: IntFieldUpdateOperationsInput | number
    orgType?: StringFieldUpdateOperationsInput | string
    orderNum?: IntFieldUpdateOperationsInput | number
    isVirtual?: BoolFieldUpdateOperationsInput | boolean
    isEntity?: BoolFieldUpdateOperationsInput | boolean
    status?: BoolFieldUpdateOperationsInput | boolean
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    compEmployments?: EmploymentUncheckedUpdateManyWithoutCompanyNestedInput
    roles?: OrganizationRoleUncheckedUpdateManyWithoutOrganizationNestedInput
  }

  export type OrganizationUpsertWithoutCompEmploymentsInput = {
    update: XOR<OrganizationUpdateWithoutCompEmploymentsInput, OrganizationUncheckedUpdateWithoutCompEmploymentsInput>
    create: XOR<OrganizationCreateWithoutCompEmploymentsInput, OrganizationUncheckedCreateWithoutCompEmploymentsInput>
    where?: OrganizationWhereInput
  }

  export type OrganizationUpdateToOneWithWhereWithoutCompEmploymentsInput = {
    where?: OrganizationWhereInput
    data: XOR<OrganizationUpdateWithoutCompEmploymentsInput, OrganizationUncheckedUpdateWithoutCompEmploymentsInput>
  }

  export type OrganizationUpdateWithoutCompEmploymentsInput = {
    orgCode?: StringFieldUpdateOperationsInput | string
    orgName?: StringFieldUpdateOperationsInput | string
    parentId?: IntFieldUpdateOperationsInput | number
    businessParentId?: IntFieldUpdateOperationsInput | number
    level?: IntFieldUpdateOperationsInput | number
    orgType?: StringFieldUpdateOperationsInput | string
    orderNum?: IntFieldUpdateOperationsInput | number
    isVirtual?: BoolFieldUpdateOperationsInput | boolean
    isEntity?: BoolFieldUpdateOperationsInput | boolean
    status?: BoolFieldUpdateOperationsInput | boolean
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    deptEmployments?: EmploymentUpdateManyWithoutDeptartmentNestedInput
    roles?: OrganizationRoleUpdateManyWithoutOrganizationNestedInput
  }

  export type OrganizationUncheckedUpdateWithoutCompEmploymentsInput = {
    id?: IntFieldUpdateOperationsInput | number
    orgCode?: StringFieldUpdateOperationsInput | string
    orgName?: StringFieldUpdateOperationsInput | string
    parentId?: IntFieldUpdateOperationsInput | number
    businessParentId?: IntFieldUpdateOperationsInput | number
    level?: IntFieldUpdateOperationsInput | number
    orgType?: StringFieldUpdateOperationsInput | string
    orderNum?: IntFieldUpdateOperationsInput | number
    isVirtual?: BoolFieldUpdateOperationsInput | boolean
    isEntity?: BoolFieldUpdateOperationsInput | boolean
    status?: BoolFieldUpdateOperationsInput | boolean
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    deptEmployments?: EmploymentUncheckedUpdateManyWithoutDeptartmentNestedInput
    roles?: OrganizationRoleUncheckedUpdateManyWithoutOrganizationNestedInput
  }

  export type PositionUpsertWithoutEmploymentsInput = {
    update: XOR<PositionUpdateWithoutEmploymentsInput, PositionUncheckedUpdateWithoutEmploymentsInput>
    create: XOR<PositionCreateWithoutEmploymentsInput, PositionUncheckedCreateWithoutEmploymentsInput>
    where?: PositionWhereInput
  }

  export type PositionUpdateToOneWithWhereWithoutEmploymentsInput = {
    where?: PositionWhereInput
    data: XOR<PositionUpdateWithoutEmploymentsInput, PositionUncheckedUpdateWithoutEmploymentsInput>
  }

  export type PositionUpdateWithoutEmploymentsInput = {
    posCode?: StringFieldUpdateOperationsInput | string
    posName?: StringFieldUpdateOperationsInput | string
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    roles?: PositionRoleUpdateManyWithoutPositionNestedInput
  }

  export type PositionUncheckedUpdateWithoutEmploymentsInput = {
    id?: IntFieldUpdateOperationsInput | number
    posCode?: StringFieldUpdateOperationsInput | string
    posName?: StringFieldUpdateOperationsInput | string
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    roles?: PositionRoleUncheckedUpdateManyWithoutPositionNestedInput
  }

  export type EmploymentRoleUpsertWithWhereUniqueWithoutEmploymentInput = {
    where: EmploymentRoleWhereUniqueInput
    update: XOR<EmploymentRoleUpdateWithoutEmploymentInput, EmploymentRoleUncheckedUpdateWithoutEmploymentInput>
    create: XOR<EmploymentRoleCreateWithoutEmploymentInput, EmploymentRoleUncheckedCreateWithoutEmploymentInput>
  }

  export type EmploymentRoleUpdateWithWhereUniqueWithoutEmploymentInput = {
    where: EmploymentRoleWhereUniqueInput
    data: XOR<EmploymentRoleUpdateWithoutEmploymentInput, EmploymentRoleUncheckedUpdateWithoutEmploymentInput>
  }

  export type EmploymentRoleUpdateManyWithWhereWithoutEmploymentInput = {
    where: EmploymentRoleScalarWhereInput
    data: XOR<EmploymentRoleUpdateManyMutationInput, EmploymentRoleUncheckedUpdateManyWithoutEmploymentInput>
  }

  export type EmploymentRoleScalarWhereInput = {
    AND?: EmploymentRoleScalarWhereInput | EmploymentRoleScalarWhereInput[]
    OR?: EmploymentRoleScalarWhereInput[]
    NOT?: EmploymentRoleScalarWhereInput | EmploymentRoleScalarWhereInput[]
    employmentId?: IntFilter<"EmploymentRole"> | number
    roleId?: IntFilter<"EmploymentRole"> | number
  }

  export type RoleCreateWithoutClientInput = {
    roleCode: string
    roleName: string
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    positions?: PositionRoleCreateNestedManyWithoutRoleInput
    organizations?: OrganizationRoleCreateNestedManyWithoutRoleInput
    employments?: EmploymentRoleCreateNestedManyWithoutRoleInput
    privileges?: RolePrivilegeCreateNestedManyWithoutRoleInput
  }

  export type RoleUncheckedCreateWithoutClientInput = {
    id?: number
    roleCode: string
    roleName: string
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    positions?: PositionRoleUncheckedCreateNestedManyWithoutRoleInput
    organizations?: OrganizationRoleUncheckedCreateNestedManyWithoutRoleInput
    employments?: EmploymentRoleUncheckedCreateNestedManyWithoutRoleInput
    privileges?: RolePrivilegeUncheckedCreateNestedManyWithoutRoleInput
  }

  export type RoleCreateOrConnectWithoutClientInput = {
    where: RoleWhereUniqueInput
    create: XOR<RoleCreateWithoutClientInput, RoleUncheckedCreateWithoutClientInput>
  }

  export type RoleCreateManyClientInputEnvelope = {
    data: RoleCreateManyClientInput | RoleCreateManyClientInput[]
    skipDuplicates?: boolean
  }

  export type RoleUpsertWithWhereUniqueWithoutClientInput = {
    where: RoleWhereUniqueInput
    update: XOR<RoleUpdateWithoutClientInput, RoleUncheckedUpdateWithoutClientInput>
    create: XOR<RoleCreateWithoutClientInput, RoleUncheckedCreateWithoutClientInput>
  }

  export type RoleUpdateWithWhereUniqueWithoutClientInput = {
    where: RoleWhereUniqueInput
    data: XOR<RoleUpdateWithoutClientInput, RoleUncheckedUpdateWithoutClientInput>
  }

  export type RoleUpdateManyWithWhereWithoutClientInput = {
    where: RoleScalarWhereInput
    data: XOR<RoleUpdateManyMutationInput, RoleUncheckedUpdateManyWithoutClientInput>
  }

  export type RoleScalarWhereInput = {
    AND?: RoleScalarWhereInput | RoleScalarWhereInput[]
    OR?: RoleScalarWhereInput[]
    NOT?: RoleScalarWhereInput | RoleScalarWhereInput[]
    id?: IntFilter<"Role"> | number
    roleCode?: StringFilter<"Role"> | string
    roleName?: StringFilter<"Role"> | string
    clientId?: IntFilter<"Role"> | number
    status?: IntFilter<"Role"> | number
    description?: StringNullableFilter<"Role"> | string | null
    isDelete?: BoolFilter<"Role"> | boolean
    createTime?: DateTimeFilter<"Role"> | Date | string
    updateTime?: DateTimeFilter<"Role"> | Date | string
  }

  export type ClientCreateWithoutRoleInput = {
    clientCode: string
    clientName: string
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
  }

  export type ClientUncheckedCreateWithoutRoleInput = {
    id?: number
    clientCode: string
    clientName: string
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
  }

  export type ClientCreateOrConnectWithoutRoleInput = {
    where: ClientWhereUniqueInput
    create: XOR<ClientCreateWithoutRoleInput, ClientUncheckedCreateWithoutRoleInput>
  }

  export type PositionRoleCreateWithoutRoleInput = {
    position: PositionCreateNestedOneWithoutRolesInput
  }

  export type PositionRoleUncheckedCreateWithoutRoleInput = {
    positionId: number
  }

  export type PositionRoleCreateOrConnectWithoutRoleInput = {
    where: PositionRoleWhereUniqueInput
    create: XOR<PositionRoleCreateWithoutRoleInput, PositionRoleUncheckedCreateWithoutRoleInput>
  }

  export type PositionRoleCreateManyRoleInputEnvelope = {
    data: PositionRoleCreateManyRoleInput | PositionRoleCreateManyRoleInput[]
    skipDuplicates?: boolean
  }

  export type OrganizationRoleCreateWithoutRoleInput = {
    organization: OrganizationCreateNestedOneWithoutRolesInput
  }

  export type OrganizationRoleUncheckedCreateWithoutRoleInput = {
    organizationId: number
  }

  export type OrganizationRoleCreateOrConnectWithoutRoleInput = {
    where: OrganizationRoleWhereUniqueInput
    create: XOR<OrganizationRoleCreateWithoutRoleInput, OrganizationRoleUncheckedCreateWithoutRoleInput>
  }

  export type OrganizationRoleCreateManyRoleInputEnvelope = {
    data: OrganizationRoleCreateManyRoleInput | OrganizationRoleCreateManyRoleInput[]
    skipDuplicates?: boolean
  }

  export type EmploymentRoleCreateWithoutRoleInput = {
    employment: EmploymentCreateNestedOneWithoutRolesInput
  }

  export type EmploymentRoleUncheckedCreateWithoutRoleInput = {
    employmentId: number
  }

  export type EmploymentRoleCreateOrConnectWithoutRoleInput = {
    where: EmploymentRoleWhereUniqueInput
    create: XOR<EmploymentRoleCreateWithoutRoleInput, EmploymentRoleUncheckedCreateWithoutRoleInput>
  }

  export type EmploymentRoleCreateManyRoleInputEnvelope = {
    data: EmploymentRoleCreateManyRoleInput | EmploymentRoleCreateManyRoleInput[]
    skipDuplicates?: boolean
  }

  export type RolePrivilegeCreateWithoutRoleInput = {
    privilege: PrivilegeCreateNestedOneWithoutRolesInput
  }

  export type RolePrivilegeUncheckedCreateWithoutRoleInput = {
    privilegeId: number
  }

  export type RolePrivilegeCreateOrConnectWithoutRoleInput = {
    where: RolePrivilegeWhereUniqueInput
    create: XOR<RolePrivilegeCreateWithoutRoleInput, RolePrivilegeUncheckedCreateWithoutRoleInput>
  }

  export type RolePrivilegeCreateManyRoleInputEnvelope = {
    data: RolePrivilegeCreateManyRoleInput | RolePrivilegeCreateManyRoleInput[]
    skipDuplicates?: boolean
  }

  export type ClientUpsertWithoutRoleInput = {
    update: XOR<ClientUpdateWithoutRoleInput, ClientUncheckedUpdateWithoutRoleInput>
    create: XOR<ClientCreateWithoutRoleInput, ClientUncheckedCreateWithoutRoleInput>
    where?: ClientWhereInput
  }

  export type ClientUpdateToOneWithWhereWithoutRoleInput = {
    where?: ClientWhereInput
    data: XOR<ClientUpdateWithoutRoleInput, ClientUncheckedUpdateWithoutRoleInput>
  }

  export type ClientUpdateWithoutRoleInput = {
    clientCode?: StringFieldUpdateOperationsInput | string
    clientName?: StringFieldUpdateOperationsInput | string
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ClientUncheckedUpdateWithoutRoleInput = {
    id?: IntFieldUpdateOperationsInput | number
    clientCode?: StringFieldUpdateOperationsInput | string
    clientName?: StringFieldUpdateOperationsInput | string
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type PositionRoleUpsertWithWhereUniqueWithoutRoleInput = {
    where: PositionRoleWhereUniqueInput
    update: XOR<PositionRoleUpdateWithoutRoleInput, PositionRoleUncheckedUpdateWithoutRoleInput>
    create: XOR<PositionRoleCreateWithoutRoleInput, PositionRoleUncheckedCreateWithoutRoleInput>
  }

  export type PositionRoleUpdateWithWhereUniqueWithoutRoleInput = {
    where: PositionRoleWhereUniqueInput
    data: XOR<PositionRoleUpdateWithoutRoleInput, PositionRoleUncheckedUpdateWithoutRoleInput>
  }

  export type PositionRoleUpdateManyWithWhereWithoutRoleInput = {
    where: PositionRoleScalarWhereInput
    data: XOR<PositionRoleUpdateManyMutationInput, PositionRoleUncheckedUpdateManyWithoutRoleInput>
  }

  export type OrganizationRoleUpsertWithWhereUniqueWithoutRoleInput = {
    where: OrganizationRoleWhereUniqueInput
    update: XOR<OrganizationRoleUpdateWithoutRoleInput, OrganizationRoleUncheckedUpdateWithoutRoleInput>
    create: XOR<OrganizationRoleCreateWithoutRoleInput, OrganizationRoleUncheckedCreateWithoutRoleInput>
  }

  export type OrganizationRoleUpdateWithWhereUniqueWithoutRoleInput = {
    where: OrganizationRoleWhereUniqueInput
    data: XOR<OrganizationRoleUpdateWithoutRoleInput, OrganizationRoleUncheckedUpdateWithoutRoleInput>
  }

  export type OrganizationRoleUpdateManyWithWhereWithoutRoleInput = {
    where: OrganizationRoleScalarWhereInput
    data: XOR<OrganizationRoleUpdateManyMutationInput, OrganizationRoleUncheckedUpdateManyWithoutRoleInput>
  }

  export type EmploymentRoleUpsertWithWhereUniqueWithoutRoleInput = {
    where: EmploymentRoleWhereUniqueInput
    update: XOR<EmploymentRoleUpdateWithoutRoleInput, EmploymentRoleUncheckedUpdateWithoutRoleInput>
    create: XOR<EmploymentRoleCreateWithoutRoleInput, EmploymentRoleUncheckedCreateWithoutRoleInput>
  }

  export type EmploymentRoleUpdateWithWhereUniqueWithoutRoleInput = {
    where: EmploymentRoleWhereUniqueInput
    data: XOR<EmploymentRoleUpdateWithoutRoleInput, EmploymentRoleUncheckedUpdateWithoutRoleInput>
  }

  export type EmploymentRoleUpdateManyWithWhereWithoutRoleInput = {
    where: EmploymentRoleScalarWhereInput
    data: XOR<EmploymentRoleUpdateManyMutationInput, EmploymentRoleUncheckedUpdateManyWithoutRoleInput>
  }

  export type RolePrivilegeUpsertWithWhereUniqueWithoutRoleInput = {
    where: RolePrivilegeWhereUniqueInput
    update: XOR<RolePrivilegeUpdateWithoutRoleInput, RolePrivilegeUncheckedUpdateWithoutRoleInput>
    create: XOR<RolePrivilegeCreateWithoutRoleInput, RolePrivilegeUncheckedCreateWithoutRoleInput>
  }

  export type RolePrivilegeUpdateWithWhereUniqueWithoutRoleInput = {
    where: RolePrivilegeWhereUniqueInput
    data: XOR<RolePrivilegeUpdateWithoutRoleInput, RolePrivilegeUncheckedUpdateWithoutRoleInput>
  }

  export type RolePrivilegeUpdateManyWithWhereWithoutRoleInput = {
    where: RolePrivilegeScalarWhereInput
    data: XOR<RolePrivilegeUpdateManyMutationInput, RolePrivilegeUncheckedUpdateManyWithoutRoleInput>
  }

  export type RolePrivilegeScalarWhereInput = {
    AND?: RolePrivilegeScalarWhereInput | RolePrivilegeScalarWhereInput[]
    OR?: RolePrivilegeScalarWhereInput[]
    NOT?: RolePrivilegeScalarWhereInput | RolePrivilegeScalarWhereInput[]
    roleId?: IntFilter<"RolePrivilege"> | number
    privilegeId?: IntFilter<"RolePrivilege"> | number
  }

  export type PositionCreateWithoutRolesInput = {
    posCode: string
    posName: string
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    employments?: EmploymentCreateNestedManyWithoutPositionInput
  }

  export type PositionUncheckedCreateWithoutRolesInput = {
    id?: number
    posCode: string
    posName: string
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    employments?: EmploymentUncheckedCreateNestedManyWithoutPositionInput
  }

  export type PositionCreateOrConnectWithoutRolesInput = {
    where: PositionWhereUniqueInput
    create: XOR<PositionCreateWithoutRolesInput, PositionUncheckedCreateWithoutRolesInput>
  }

  export type RoleCreateWithoutPositionsInput = {
    roleCode: string
    roleName: string
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    client: ClientCreateNestedOneWithoutRoleInput
    organizations?: OrganizationRoleCreateNestedManyWithoutRoleInput
    employments?: EmploymentRoleCreateNestedManyWithoutRoleInput
    privileges?: RolePrivilegeCreateNestedManyWithoutRoleInput
  }

  export type RoleUncheckedCreateWithoutPositionsInput = {
    id?: number
    roleCode: string
    roleName: string
    clientId: number
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    organizations?: OrganizationRoleUncheckedCreateNestedManyWithoutRoleInput
    employments?: EmploymentRoleUncheckedCreateNestedManyWithoutRoleInput
    privileges?: RolePrivilegeUncheckedCreateNestedManyWithoutRoleInput
  }

  export type RoleCreateOrConnectWithoutPositionsInput = {
    where: RoleWhereUniqueInput
    create: XOR<RoleCreateWithoutPositionsInput, RoleUncheckedCreateWithoutPositionsInput>
  }

  export type PositionUpsertWithoutRolesInput = {
    update: XOR<PositionUpdateWithoutRolesInput, PositionUncheckedUpdateWithoutRolesInput>
    create: XOR<PositionCreateWithoutRolesInput, PositionUncheckedCreateWithoutRolesInput>
    where?: PositionWhereInput
  }

  export type PositionUpdateToOneWithWhereWithoutRolesInput = {
    where?: PositionWhereInput
    data: XOR<PositionUpdateWithoutRolesInput, PositionUncheckedUpdateWithoutRolesInput>
  }

  export type PositionUpdateWithoutRolesInput = {
    posCode?: StringFieldUpdateOperationsInput | string
    posName?: StringFieldUpdateOperationsInput | string
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    employments?: EmploymentUpdateManyWithoutPositionNestedInput
  }

  export type PositionUncheckedUpdateWithoutRolesInput = {
    id?: IntFieldUpdateOperationsInput | number
    posCode?: StringFieldUpdateOperationsInput | string
    posName?: StringFieldUpdateOperationsInput | string
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    employments?: EmploymentUncheckedUpdateManyWithoutPositionNestedInput
  }

  export type RoleUpsertWithoutPositionsInput = {
    update: XOR<RoleUpdateWithoutPositionsInput, RoleUncheckedUpdateWithoutPositionsInput>
    create: XOR<RoleCreateWithoutPositionsInput, RoleUncheckedCreateWithoutPositionsInput>
    where?: RoleWhereInput
  }

  export type RoleUpdateToOneWithWhereWithoutPositionsInput = {
    where?: RoleWhereInput
    data: XOR<RoleUpdateWithoutPositionsInput, RoleUncheckedUpdateWithoutPositionsInput>
  }

  export type RoleUpdateWithoutPositionsInput = {
    roleCode?: StringFieldUpdateOperationsInput | string
    roleName?: StringFieldUpdateOperationsInput | string
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    client?: ClientUpdateOneRequiredWithoutRoleNestedInput
    organizations?: OrganizationRoleUpdateManyWithoutRoleNestedInput
    employments?: EmploymentRoleUpdateManyWithoutRoleNestedInput
    privileges?: RolePrivilegeUpdateManyWithoutRoleNestedInput
  }

  export type RoleUncheckedUpdateWithoutPositionsInput = {
    id?: IntFieldUpdateOperationsInput | number
    roleCode?: StringFieldUpdateOperationsInput | string
    roleName?: StringFieldUpdateOperationsInput | string
    clientId?: IntFieldUpdateOperationsInput | number
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    organizations?: OrganizationRoleUncheckedUpdateManyWithoutRoleNestedInput
    employments?: EmploymentRoleUncheckedUpdateManyWithoutRoleNestedInput
    privileges?: RolePrivilegeUncheckedUpdateManyWithoutRoleNestedInput
  }

  export type EmploymentCreateWithoutRolesInput = {
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    user: UserCreateNestedOneWithoutEmploymentsInput
    deptartment: OrganizationCreateNestedOneWithoutDeptEmploymentsInput
    company: OrganizationCreateNestedOneWithoutCompEmploymentsInput
    position: PositionCreateNestedOneWithoutEmploymentsInput
  }

  export type EmploymentUncheckedCreateWithoutRolesInput = {
    id?: number
    userId: number
    posId: number
    deptId: number
    compId: number
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
  }

  export type EmploymentCreateOrConnectWithoutRolesInput = {
    where: EmploymentWhereUniqueInput
    create: XOR<EmploymentCreateWithoutRolesInput, EmploymentUncheckedCreateWithoutRolesInput>
  }

  export type RoleCreateWithoutEmploymentsInput = {
    roleCode: string
    roleName: string
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    client: ClientCreateNestedOneWithoutRoleInput
    positions?: PositionRoleCreateNestedManyWithoutRoleInput
    organizations?: OrganizationRoleCreateNestedManyWithoutRoleInput
    privileges?: RolePrivilegeCreateNestedManyWithoutRoleInput
  }

  export type RoleUncheckedCreateWithoutEmploymentsInput = {
    id?: number
    roleCode: string
    roleName: string
    clientId: number
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    positions?: PositionRoleUncheckedCreateNestedManyWithoutRoleInput
    organizations?: OrganizationRoleUncheckedCreateNestedManyWithoutRoleInput
    privileges?: RolePrivilegeUncheckedCreateNestedManyWithoutRoleInput
  }

  export type RoleCreateOrConnectWithoutEmploymentsInput = {
    where: RoleWhereUniqueInput
    create: XOR<RoleCreateWithoutEmploymentsInput, RoleUncheckedCreateWithoutEmploymentsInput>
  }

  export type EmploymentUpsertWithoutRolesInput = {
    update: XOR<EmploymentUpdateWithoutRolesInput, EmploymentUncheckedUpdateWithoutRolesInput>
    create: XOR<EmploymentCreateWithoutRolesInput, EmploymentUncheckedCreateWithoutRolesInput>
    where?: EmploymentWhereInput
  }

  export type EmploymentUpdateToOneWithWhereWithoutRolesInput = {
    where?: EmploymentWhereInput
    data: XOR<EmploymentUpdateWithoutRolesInput, EmploymentUncheckedUpdateWithoutRolesInput>
  }

  export type EmploymentUpdateWithoutRolesInput = {
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    user?: UserUpdateOneRequiredWithoutEmploymentsNestedInput
    deptartment?: OrganizationUpdateOneRequiredWithoutDeptEmploymentsNestedInput
    company?: OrganizationUpdateOneRequiredWithoutCompEmploymentsNestedInput
    position?: PositionUpdateOneRequiredWithoutEmploymentsNestedInput
  }

  export type EmploymentUncheckedUpdateWithoutRolesInput = {
    id?: IntFieldUpdateOperationsInput | number
    userId?: IntFieldUpdateOperationsInput | number
    posId?: IntFieldUpdateOperationsInput | number
    deptId?: IntFieldUpdateOperationsInput | number
    compId?: IntFieldUpdateOperationsInput | number
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type RoleUpsertWithoutEmploymentsInput = {
    update: XOR<RoleUpdateWithoutEmploymentsInput, RoleUncheckedUpdateWithoutEmploymentsInput>
    create: XOR<RoleCreateWithoutEmploymentsInput, RoleUncheckedCreateWithoutEmploymentsInput>
    where?: RoleWhereInput
  }

  export type RoleUpdateToOneWithWhereWithoutEmploymentsInput = {
    where?: RoleWhereInput
    data: XOR<RoleUpdateWithoutEmploymentsInput, RoleUncheckedUpdateWithoutEmploymentsInput>
  }

  export type RoleUpdateWithoutEmploymentsInput = {
    roleCode?: StringFieldUpdateOperationsInput | string
    roleName?: StringFieldUpdateOperationsInput | string
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    client?: ClientUpdateOneRequiredWithoutRoleNestedInput
    positions?: PositionRoleUpdateManyWithoutRoleNestedInput
    organizations?: OrganizationRoleUpdateManyWithoutRoleNestedInput
    privileges?: RolePrivilegeUpdateManyWithoutRoleNestedInput
  }

  export type RoleUncheckedUpdateWithoutEmploymentsInput = {
    id?: IntFieldUpdateOperationsInput | number
    roleCode?: StringFieldUpdateOperationsInput | string
    roleName?: StringFieldUpdateOperationsInput | string
    clientId?: IntFieldUpdateOperationsInput | number
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    positions?: PositionRoleUncheckedUpdateManyWithoutRoleNestedInput
    organizations?: OrganizationRoleUncheckedUpdateManyWithoutRoleNestedInput
    privileges?: RolePrivilegeUncheckedUpdateManyWithoutRoleNestedInput
  }

  export type OrganizationCreateWithoutRolesInput = {
    orgCode: string
    orgName: string
    parentId?: number
    businessParentId?: number
    level: number
    orgType: string
    orderNum?: number
    isVirtual?: boolean
    isEntity?: boolean
    status?: boolean
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    deptEmployments?: EmploymentCreateNestedManyWithoutDeptartmentInput
    compEmployments?: EmploymentCreateNestedManyWithoutCompanyInput
  }

  export type OrganizationUncheckedCreateWithoutRolesInput = {
    id?: number
    orgCode: string
    orgName: string
    parentId?: number
    businessParentId?: number
    level: number
    orgType: string
    orderNum?: number
    isVirtual?: boolean
    isEntity?: boolean
    status?: boolean
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    deptEmployments?: EmploymentUncheckedCreateNestedManyWithoutDeptartmentInput
    compEmployments?: EmploymentUncheckedCreateNestedManyWithoutCompanyInput
  }

  export type OrganizationCreateOrConnectWithoutRolesInput = {
    where: OrganizationWhereUniqueInput
    create: XOR<OrganizationCreateWithoutRolesInput, OrganizationUncheckedCreateWithoutRolesInput>
  }

  export type RoleCreateWithoutOrganizationsInput = {
    roleCode: string
    roleName: string
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    client: ClientCreateNestedOneWithoutRoleInput
    positions?: PositionRoleCreateNestedManyWithoutRoleInput
    employments?: EmploymentRoleCreateNestedManyWithoutRoleInput
    privileges?: RolePrivilegeCreateNestedManyWithoutRoleInput
  }

  export type RoleUncheckedCreateWithoutOrganizationsInput = {
    id?: number
    roleCode: string
    roleName: string
    clientId: number
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    positions?: PositionRoleUncheckedCreateNestedManyWithoutRoleInput
    employments?: EmploymentRoleUncheckedCreateNestedManyWithoutRoleInput
    privileges?: RolePrivilegeUncheckedCreateNestedManyWithoutRoleInput
  }

  export type RoleCreateOrConnectWithoutOrganizationsInput = {
    where: RoleWhereUniqueInput
    create: XOR<RoleCreateWithoutOrganizationsInput, RoleUncheckedCreateWithoutOrganizationsInput>
  }

  export type OrganizationUpsertWithoutRolesInput = {
    update: XOR<OrganizationUpdateWithoutRolesInput, OrganizationUncheckedUpdateWithoutRolesInput>
    create: XOR<OrganizationCreateWithoutRolesInput, OrganizationUncheckedCreateWithoutRolesInput>
    where?: OrganizationWhereInput
  }

  export type OrganizationUpdateToOneWithWhereWithoutRolesInput = {
    where?: OrganizationWhereInput
    data: XOR<OrganizationUpdateWithoutRolesInput, OrganizationUncheckedUpdateWithoutRolesInput>
  }

  export type OrganizationUpdateWithoutRolesInput = {
    orgCode?: StringFieldUpdateOperationsInput | string
    orgName?: StringFieldUpdateOperationsInput | string
    parentId?: IntFieldUpdateOperationsInput | number
    businessParentId?: IntFieldUpdateOperationsInput | number
    level?: IntFieldUpdateOperationsInput | number
    orgType?: StringFieldUpdateOperationsInput | string
    orderNum?: IntFieldUpdateOperationsInput | number
    isVirtual?: BoolFieldUpdateOperationsInput | boolean
    isEntity?: BoolFieldUpdateOperationsInput | boolean
    status?: BoolFieldUpdateOperationsInput | boolean
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    deptEmployments?: EmploymentUpdateManyWithoutDeptartmentNestedInput
    compEmployments?: EmploymentUpdateManyWithoutCompanyNestedInput
  }

  export type OrganizationUncheckedUpdateWithoutRolesInput = {
    id?: IntFieldUpdateOperationsInput | number
    orgCode?: StringFieldUpdateOperationsInput | string
    orgName?: StringFieldUpdateOperationsInput | string
    parentId?: IntFieldUpdateOperationsInput | number
    businessParentId?: IntFieldUpdateOperationsInput | number
    level?: IntFieldUpdateOperationsInput | number
    orgType?: StringFieldUpdateOperationsInput | string
    orderNum?: IntFieldUpdateOperationsInput | number
    isVirtual?: BoolFieldUpdateOperationsInput | boolean
    isEntity?: BoolFieldUpdateOperationsInput | boolean
    status?: BoolFieldUpdateOperationsInput | boolean
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    deptEmployments?: EmploymentUncheckedUpdateManyWithoutDeptartmentNestedInput
    compEmployments?: EmploymentUncheckedUpdateManyWithoutCompanyNestedInput
  }

  export type RoleUpsertWithoutOrganizationsInput = {
    update: XOR<RoleUpdateWithoutOrganizationsInput, RoleUncheckedUpdateWithoutOrganizationsInput>
    create: XOR<RoleCreateWithoutOrganizationsInput, RoleUncheckedCreateWithoutOrganizationsInput>
    where?: RoleWhereInput
  }

  export type RoleUpdateToOneWithWhereWithoutOrganizationsInput = {
    where?: RoleWhereInput
    data: XOR<RoleUpdateWithoutOrganizationsInput, RoleUncheckedUpdateWithoutOrganizationsInput>
  }

  export type RoleUpdateWithoutOrganizationsInput = {
    roleCode?: StringFieldUpdateOperationsInput | string
    roleName?: StringFieldUpdateOperationsInput | string
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    client?: ClientUpdateOneRequiredWithoutRoleNestedInput
    positions?: PositionRoleUpdateManyWithoutRoleNestedInput
    employments?: EmploymentRoleUpdateManyWithoutRoleNestedInput
    privileges?: RolePrivilegeUpdateManyWithoutRoleNestedInput
  }

  export type RoleUncheckedUpdateWithoutOrganizationsInput = {
    id?: IntFieldUpdateOperationsInput | number
    roleCode?: StringFieldUpdateOperationsInput | string
    roleName?: StringFieldUpdateOperationsInput | string
    clientId?: IntFieldUpdateOperationsInput | number
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    positions?: PositionRoleUncheckedUpdateManyWithoutRoleNestedInput
    employments?: EmploymentRoleUncheckedUpdateManyWithoutRoleNestedInput
    privileges?: RolePrivilegeUncheckedUpdateManyWithoutRoleNestedInput
  }

  export type PrivilegeCreateWithoutObjectInput = {
    privilegeCode: string
    privilegeName: string
    fieldValues?: NullableJsonNullValueInput | InputJsonValue
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    roles?: RolePrivilegeCreateNestedManyWithoutPrivilegeInput
  }

  export type PrivilegeUncheckedCreateWithoutObjectInput = {
    id?: number
    privilegeCode: string
    privilegeName: string
    fieldValues?: NullableJsonNullValueInput | InputJsonValue
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    roles?: RolePrivilegeUncheckedCreateNestedManyWithoutPrivilegeInput
  }

  export type PrivilegeCreateOrConnectWithoutObjectInput = {
    where: PrivilegeWhereUniqueInput
    create: XOR<PrivilegeCreateWithoutObjectInput, PrivilegeUncheckedCreateWithoutObjectInput>
  }

  export type PrivilegeCreateManyObjectInputEnvelope = {
    data: PrivilegeCreateManyObjectInput | PrivilegeCreateManyObjectInput[]
    skipDuplicates?: boolean
  }

  export type PrivilegeUpsertWithWhereUniqueWithoutObjectInput = {
    where: PrivilegeWhereUniqueInput
    update: XOR<PrivilegeUpdateWithoutObjectInput, PrivilegeUncheckedUpdateWithoutObjectInput>
    create: XOR<PrivilegeCreateWithoutObjectInput, PrivilegeUncheckedCreateWithoutObjectInput>
  }

  export type PrivilegeUpdateWithWhereUniqueWithoutObjectInput = {
    where: PrivilegeWhereUniqueInput
    data: XOR<PrivilegeUpdateWithoutObjectInput, PrivilegeUncheckedUpdateWithoutObjectInput>
  }

  export type PrivilegeUpdateManyWithWhereWithoutObjectInput = {
    where: PrivilegeScalarWhereInput
    data: XOR<PrivilegeUpdateManyMutationInput, PrivilegeUncheckedUpdateManyWithoutObjectInput>
  }

  export type PrivilegeScalarWhereInput = {
    AND?: PrivilegeScalarWhereInput | PrivilegeScalarWhereInput[]
    OR?: PrivilegeScalarWhereInput[]
    NOT?: PrivilegeScalarWhereInput | PrivilegeScalarWhereInput[]
    id?: IntFilter<"Privilege"> | number
    privilegeCode?: StringFilter<"Privilege"> | string
    privilegeName?: StringFilter<"Privilege"> | string
    objectId?: IntFilter<"Privilege"> | number
    fieldValues?: JsonNullableFilter<"Privilege">
    status?: IntFilter<"Privilege"> | number
    description?: StringNullableFilter<"Privilege"> | string | null
    isDelete?: BoolFilter<"Privilege"> | boolean
    createTime?: DateTimeFilter<"Privilege"> | Date | string
    updateTime?: DateTimeFilter<"Privilege"> | Date | string
  }

  export type RolePrivilegeCreateWithoutPrivilegeInput = {
    role: RoleCreateNestedOneWithoutPrivilegesInput
  }

  export type RolePrivilegeUncheckedCreateWithoutPrivilegeInput = {
    roleId: number
  }

  export type RolePrivilegeCreateOrConnectWithoutPrivilegeInput = {
    where: RolePrivilegeWhereUniqueInput
    create: XOR<RolePrivilegeCreateWithoutPrivilegeInput, RolePrivilegeUncheckedCreateWithoutPrivilegeInput>
  }

  export type RolePrivilegeCreateManyPrivilegeInputEnvelope = {
    data: RolePrivilegeCreateManyPrivilegeInput | RolePrivilegeCreateManyPrivilegeInput[]
    skipDuplicates?: boolean
  }

  export type AuthObjectCreateWithoutPrivilegesInput = {
    objectCode: string
    objectName: string
    objectType: string
    path?: string | null
    authFields?: NullableJsonNullValueInput | InputJsonValue
  }

  export type AuthObjectUncheckedCreateWithoutPrivilegesInput = {
    id?: number
    objectCode: string
    objectName: string
    objectType: string
    path?: string | null
    authFields?: NullableJsonNullValueInput | InputJsonValue
  }

  export type AuthObjectCreateOrConnectWithoutPrivilegesInput = {
    where: AuthObjectWhereUniqueInput
    create: XOR<AuthObjectCreateWithoutPrivilegesInput, AuthObjectUncheckedCreateWithoutPrivilegesInput>
  }

  export type RolePrivilegeUpsertWithWhereUniqueWithoutPrivilegeInput = {
    where: RolePrivilegeWhereUniqueInput
    update: XOR<RolePrivilegeUpdateWithoutPrivilegeInput, RolePrivilegeUncheckedUpdateWithoutPrivilegeInput>
    create: XOR<RolePrivilegeCreateWithoutPrivilegeInput, RolePrivilegeUncheckedCreateWithoutPrivilegeInput>
  }

  export type RolePrivilegeUpdateWithWhereUniqueWithoutPrivilegeInput = {
    where: RolePrivilegeWhereUniqueInput
    data: XOR<RolePrivilegeUpdateWithoutPrivilegeInput, RolePrivilegeUncheckedUpdateWithoutPrivilegeInput>
  }

  export type RolePrivilegeUpdateManyWithWhereWithoutPrivilegeInput = {
    where: RolePrivilegeScalarWhereInput
    data: XOR<RolePrivilegeUpdateManyMutationInput, RolePrivilegeUncheckedUpdateManyWithoutPrivilegeInput>
  }

  export type AuthObjectUpsertWithoutPrivilegesInput = {
    update: XOR<AuthObjectUpdateWithoutPrivilegesInput, AuthObjectUncheckedUpdateWithoutPrivilegesInput>
    create: XOR<AuthObjectCreateWithoutPrivilegesInput, AuthObjectUncheckedCreateWithoutPrivilegesInput>
    where?: AuthObjectWhereInput
  }

  export type AuthObjectUpdateToOneWithWhereWithoutPrivilegesInput = {
    where?: AuthObjectWhereInput
    data: XOR<AuthObjectUpdateWithoutPrivilegesInput, AuthObjectUncheckedUpdateWithoutPrivilegesInput>
  }

  export type AuthObjectUpdateWithoutPrivilegesInput = {
    objectCode?: StringFieldUpdateOperationsInput | string
    objectName?: StringFieldUpdateOperationsInput | string
    objectType?: StringFieldUpdateOperationsInput | string
    path?: NullableStringFieldUpdateOperationsInput | string | null
    authFields?: NullableJsonNullValueInput | InputJsonValue
  }

  export type AuthObjectUncheckedUpdateWithoutPrivilegesInput = {
    id?: IntFieldUpdateOperationsInput | number
    objectCode?: StringFieldUpdateOperationsInput | string
    objectName?: StringFieldUpdateOperationsInput | string
    objectType?: StringFieldUpdateOperationsInput | string
    path?: NullableStringFieldUpdateOperationsInput | string | null
    authFields?: NullableJsonNullValueInput | InputJsonValue
  }

  export type UserCreateWithoutDelegationToInput = {
    username: string
    name: string
    password?: string | null
    mobilePhone?: string | null
    userType?: string | null
    status?: number
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    employments?: EmploymentCreateNestedManyWithoutUserInput
    delegationFrom?: PrivilegeDelegationCreateNestedManyWithoutDelegateeUserInput
  }

  export type UserUncheckedCreateWithoutDelegationToInput = {
    id?: number
    username: string
    name: string
    password?: string | null
    mobilePhone?: string | null
    userType?: string | null
    status?: number
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    employments?: EmploymentUncheckedCreateNestedManyWithoutUserInput
    delegationFrom?: PrivilegeDelegationUncheckedCreateNestedManyWithoutDelegateeUserInput
  }

  export type UserCreateOrConnectWithoutDelegationToInput = {
    where: UserWhereUniqueInput
    create: XOR<UserCreateWithoutDelegationToInput, UserUncheckedCreateWithoutDelegationToInput>
  }

  export type UserCreateWithoutDelegationFromInput = {
    username: string
    name: string
    password?: string | null
    mobilePhone?: string | null
    userType?: string | null
    status?: number
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    employments?: EmploymentCreateNestedManyWithoutUserInput
    delegationTo?: PrivilegeDelegationCreateNestedManyWithoutDelegatorUserInput
  }

  export type UserUncheckedCreateWithoutDelegationFromInput = {
    id?: number
    username: string
    name: string
    password?: string | null
    mobilePhone?: string | null
    userType?: string | null
    status?: number
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    employments?: EmploymentUncheckedCreateNestedManyWithoutUserInput
    delegationTo?: PrivilegeDelegationUncheckedCreateNestedManyWithoutDelegatorUserInput
  }

  export type UserCreateOrConnectWithoutDelegationFromInput = {
    where: UserWhereUniqueInput
    create: XOR<UserCreateWithoutDelegationFromInput, UserUncheckedCreateWithoutDelegationFromInput>
  }

  export type DelegationDetailCreateWithoutDelegationInput = {
    resourceCode: string
  }

  export type DelegationDetailUncheckedCreateWithoutDelegationInput = {
    resourceCode: string
  }

  export type DelegationDetailCreateOrConnectWithoutDelegationInput = {
    where: DelegationDetailWhereUniqueInput
    create: XOR<DelegationDetailCreateWithoutDelegationInput, DelegationDetailUncheckedCreateWithoutDelegationInput>
  }

  export type DelegationDetailCreateManyDelegationInputEnvelope = {
    data: DelegationDetailCreateManyDelegationInput | DelegationDetailCreateManyDelegationInput[]
    skipDuplicates?: boolean
  }

  export type UserUpsertWithoutDelegationToInput = {
    update: XOR<UserUpdateWithoutDelegationToInput, UserUncheckedUpdateWithoutDelegationToInput>
    create: XOR<UserCreateWithoutDelegationToInput, UserUncheckedCreateWithoutDelegationToInput>
    where?: UserWhereInput
  }

  export type UserUpdateToOneWithWhereWithoutDelegationToInput = {
    where?: UserWhereInput
    data: XOR<UserUpdateWithoutDelegationToInput, UserUncheckedUpdateWithoutDelegationToInput>
  }

  export type UserUpdateWithoutDelegationToInput = {
    username?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    password?: NullableStringFieldUpdateOperationsInput | string | null
    mobilePhone?: NullableStringFieldUpdateOperationsInput | string | null
    userType?: NullableStringFieldUpdateOperationsInput | string | null
    status?: IntFieldUpdateOperationsInput | number
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    employments?: EmploymentUpdateManyWithoutUserNestedInput
    delegationFrom?: PrivilegeDelegationUpdateManyWithoutDelegateeUserNestedInput
  }

  export type UserUncheckedUpdateWithoutDelegationToInput = {
    id?: IntFieldUpdateOperationsInput | number
    username?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    password?: NullableStringFieldUpdateOperationsInput | string | null
    mobilePhone?: NullableStringFieldUpdateOperationsInput | string | null
    userType?: NullableStringFieldUpdateOperationsInput | string | null
    status?: IntFieldUpdateOperationsInput | number
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    employments?: EmploymentUncheckedUpdateManyWithoutUserNestedInput
    delegationFrom?: PrivilegeDelegationUncheckedUpdateManyWithoutDelegateeUserNestedInput
  }

  export type UserUpsertWithoutDelegationFromInput = {
    update: XOR<UserUpdateWithoutDelegationFromInput, UserUncheckedUpdateWithoutDelegationFromInput>
    create: XOR<UserCreateWithoutDelegationFromInput, UserUncheckedCreateWithoutDelegationFromInput>
    where?: UserWhereInput
  }

  export type UserUpdateToOneWithWhereWithoutDelegationFromInput = {
    where?: UserWhereInput
    data: XOR<UserUpdateWithoutDelegationFromInput, UserUncheckedUpdateWithoutDelegationFromInput>
  }

  export type UserUpdateWithoutDelegationFromInput = {
    username?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    password?: NullableStringFieldUpdateOperationsInput | string | null
    mobilePhone?: NullableStringFieldUpdateOperationsInput | string | null
    userType?: NullableStringFieldUpdateOperationsInput | string | null
    status?: IntFieldUpdateOperationsInput | number
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    employments?: EmploymentUpdateManyWithoutUserNestedInput
    delegationTo?: PrivilegeDelegationUpdateManyWithoutDelegatorUserNestedInput
  }

  export type UserUncheckedUpdateWithoutDelegationFromInput = {
    id?: IntFieldUpdateOperationsInput | number
    username?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    password?: NullableStringFieldUpdateOperationsInput | string | null
    mobilePhone?: NullableStringFieldUpdateOperationsInput | string | null
    userType?: NullableStringFieldUpdateOperationsInput | string | null
    status?: IntFieldUpdateOperationsInput | number
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    employments?: EmploymentUncheckedUpdateManyWithoutUserNestedInput
    delegationTo?: PrivilegeDelegationUncheckedUpdateManyWithoutDelegatorUserNestedInput
  }

  export type DelegationDetailUpsertWithWhereUniqueWithoutDelegationInput = {
    where: DelegationDetailWhereUniqueInput
    update: XOR<DelegationDetailUpdateWithoutDelegationInput, DelegationDetailUncheckedUpdateWithoutDelegationInput>
    create: XOR<DelegationDetailCreateWithoutDelegationInput, DelegationDetailUncheckedCreateWithoutDelegationInput>
  }

  export type DelegationDetailUpdateWithWhereUniqueWithoutDelegationInput = {
    where: DelegationDetailWhereUniqueInput
    data: XOR<DelegationDetailUpdateWithoutDelegationInput, DelegationDetailUncheckedUpdateWithoutDelegationInput>
  }

  export type DelegationDetailUpdateManyWithWhereWithoutDelegationInput = {
    where: DelegationDetailScalarWhereInput
    data: XOR<DelegationDetailUpdateManyMutationInput, DelegationDetailUncheckedUpdateManyWithoutDelegationInput>
  }

  export type DelegationDetailScalarWhereInput = {
    AND?: DelegationDetailScalarWhereInput | DelegationDetailScalarWhereInput[]
    OR?: DelegationDetailScalarWhereInput[]
    NOT?: DelegationDetailScalarWhereInput | DelegationDetailScalarWhereInput[]
    delegationId?: IntFilter<"DelegationDetail"> | number
    resourceCode?: StringFilter<"DelegationDetail"> | string
  }

  export type PrivilegeDelegationCreateWithoutDelegationDetailsInput = {
    startTime: Date | string
    endTime: Date | string
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    delegatorUser: UserCreateNestedOneWithoutDelegationToInput
    delegateeUser: UserCreateNestedOneWithoutDelegationFromInput
  }

  export type PrivilegeDelegationUncheckedCreateWithoutDelegationDetailsInput = {
    id?: number
    delegatorUserId: number
    delegateeUserId: number
    startTime: Date | string
    endTime: Date | string
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
  }

  export type PrivilegeDelegationCreateOrConnectWithoutDelegationDetailsInput = {
    where: PrivilegeDelegationWhereUniqueInput
    create: XOR<PrivilegeDelegationCreateWithoutDelegationDetailsInput, PrivilegeDelegationUncheckedCreateWithoutDelegationDetailsInput>
  }

  export type PrivilegeDelegationUpsertWithoutDelegationDetailsInput = {
    update: XOR<PrivilegeDelegationUpdateWithoutDelegationDetailsInput, PrivilegeDelegationUncheckedUpdateWithoutDelegationDetailsInput>
    create: XOR<PrivilegeDelegationCreateWithoutDelegationDetailsInput, PrivilegeDelegationUncheckedCreateWithoutDelegationDetailsInput>
    where?: PrivilegeDelegationWhereInput
  }

  export type PrivilegeDelegationUpdateToOneWithWhereWithoutDelegationDetailsInput = {
    where?: PrivilegeDelegationWhereInput
    data: XOR<PrivilegeDelegationUpdateWithoutDelegationDetailsInput, PrivilegeDelegationUncheckedUpdateWithoutDelegationDetailsInput>
  }

  export type PrivilegeDelegationUpdateWithoutDelegationDetailsInput = {
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: DateTimeFieldUpdateOperationsInput | Date | string
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    delegatorUser?: UserUpdateOneRequiredWithoutDelegationToNestedInput
    delegateeUser?: UserUpdateOneRequiredWithoutDelegationFromNestedInput
  }

  export type PrivilegeDelegationUncheckedUpdateWithoutDelegationDetailsInput = {
    id?: IntFieldUpdateOperationsInput | number
    delegatorUserId?: IntFieldUpdateOperationsInput | number
    delegateeUserId?: IntFieldUpdateOperationsInput | number
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: DateTimeFieldUpdateOperationsInput | Date | string
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type RoleCreateWithoutPrivilegesInput = {
    roleCode: string
    roleName: string
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    client: ClientCreateNestedOneWithoutRoleInput
    positions?: PositionRoleCreateNestedManyWithoutRoleInput
    organizations?: OrganizationRoleCreateNestedManyWithoutRoleInput
    employments?: EmploymentRoleCreateNestedManyWithoutRoleInput
  }

  export type RoleUncheckedCreateWithoutPrivilegesInput = {
    id?: number
    roleCode: string
    roleName: string
    clientId: number
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    positions?: PositionRoleUncheckedCreateNestedManyWithoutRoleInput
    organizations?: OrganizationRoleUncheckedCreateNestedManyWithoutRoleInput
    employments?: EmploymentRoleUncheckedCreateNestedManyWithoutRoleInput
  }

  export type RoleCreateOrConnectWithoutPrivilegesInput = {
    where: RoleWhereUniqueInput
    create: XOR<RoleCreateWithoutPrivilegesInput, RoleUncheckedCreateWithoutPrivilegesInput>
  }

  export type PrivilegeCreateWithoutRolesInput = {
    privilegeCode: string
    privilegeName: string
    fieldValues?: NullableJsonNullValueInput | InputJsonValue
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
    object: AuthObjectCreateNestedOneWithoutPrivilegesInput
  }

  export type PrivilegeUncheckedCreateWithoutRolesInput = {
    id?: number
    privilegeCode: string
    privilegeName: string
    objectId: number
    fieldValues?: NullableJsonNullValueInput | InputJsonValue
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
  }

  export type PrivilegeCreateOrConnectWithoutRolesInput = {
    where: PrivilegeWhereUniqueInput
    create: XOR<PrivilegeCreateWithoutRolesInput, PrivilegeUncheckedCreateWithoutRolesInput>
  }

  export type RoleUpsertWithoutPrivilegesInput = {
    update: XOR<RoleUpdateWithoutPrivilegesInput, RoleUncheckedUpdateWithoutPrivilegesInput>
    create: XOR<RoleCreateWithoutPrivilegesInput, RoleUncheckedCreateWithoutPrivilegesInput>
    where?: RoleWhereInput
  }

  export type RoleUpdateToOneWithWhereWithoutPrivilegesInput = {
    where?: RoleWhereInput
    data: XOR<RoleUpdateWithoutPrivilegesInput, RoleUncheckedUpdateWithoutPrivilegesInput>
  }

  export type RoleUpdateWithoutPrivilegesInput = {
    roleCode?: StringFieldUpdateOperationsInput | string
    roleName?: StringFieldUpdateOperationsInput | string
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    client?: ClientUpdateOneRequiredWithoutRoleNestedInput
    positions?: PositionRoleUpdateManyWithoutRoleNestedInput
    organizations?: OrganizationRoleUpdateManyWithoutRoleNestedInput
    employments?: EmploymentRoleUpdateManyWithoutRoleNestedInput
  }

  export type RoleUncheckedUpdateWithoutPrivilegesInput = {
    id?: IntFieldUpdateOperationsInput | number
    roleCode?: StringFieldUpdateOperationsInput | string
    roleName?: StringFieldUpdateOperationsInput | string
    clientId?: IntFieldUpdateOperationsInput | number
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    positions?: PositionRoleUncheckedUpdateManyWithoutRoleNestedInput
    organizations?: OrganizationRoleUncheckedUpdateManyWithoutRoleNestedInput
    employments?: EmploymentRoleUncheckedUpdateManyWithoutRoleNestedInput
  }

  export type PrivilegeUpsertWithoutRolesInput = {
    update: XOR<PrivilegeUpdateWithoutRolesInput, PrivilegeUncheckedUpdateWithoutRolesInput>
    create: XOR<PrivilegeCreateWithoutRolesInput, PrivilegeUncheckedCreateWithoutRolesInput>
    where?: PrivilegeWhereInput
  }

  export type PrivilegeUpdateToOneWithWhereWithoutRolesInput = {
    where?: PrivilegeWhereInput
    data: XOR<PrivilegeUpdateWithoutRolesInput, PrivilegeUncheckedUpdateWithoutRolesInput>
  }

  export type PrivilegeUpdateWithoutRolesInput = {
    privilegeCode?: StringFieldUpdateOperationsInput | string
    privilegeName?: StringFieldUpdateOperationsInput | string
    fieldValues?: NullableJsonNullValueInput | InputJsonValue
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    object?: AuthObjectUpdateOneRequiredWithoutPrivilegesNestedInput
  }

  export type PrivilegeUncheckedUpdateWithoutRolesInput = {
    id?: IntFieldUpdateOperationsInput | number
    privilegeCode?: StringFieldUpdateOperationsInput | string
    privilegeName?: StringFieldUpdateOperationsInput | string
    objectId?: IntFieldUpdateOperationsInput | number
    fieldValues?: NullableJsonNullValueInput | InputJsonValue
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type EmploymentCreateManyUserInput = {
    id?: number
    posId: number
    deptId: number
    compId: number
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
  }

  export type PrivilegeDelegationCreateManyDelegatorUserInput = {
    id?: number
    delegateeUserId: number
    startTime: Date | string
    endTime: Date | string
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
  }

  export type PrivilegeDelegationCreateManyDelegateeUserInput = {
    id?: number
    delegatorUserId: number
    startTime: Date | string
    endTime: Date | string
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
  }

  export type EmploymentUpdateWithoutUserInput = {
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    deptartment?: OrganizationUpdateOneRequiredWithoutDeptEmploymentsNestedInput
    company?: OrganizationUpdateOneRequiredWithoutCompEmploymentsNestedInput
    position?: PositionUpdateOneRequiredWithoutEmploymentsNestedInput
    roles?: EmploymentRoleUpdateManyWithoutEmploymentNestedInput
  }

  export type EmploymentUncheckedUpdateWithoutUserInput = {
    id?: IntFieldUpdateOperationsInput | number
    posId?: IntFieldUpdateOperationsInput | number
    deptId?: IntFieldUpdateOperationsInput | number
    compId?: IntFieldUpdateOperationsInput | number
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    roles?: EmploymentRoleUncheckedUpdateManyWithoutEmploymentNestedInput
  }

  export type EmploymentUncheckedUpdateManyWithoutUserInput = {
    id?: IntFieldUpdateOperationsInput | number
    posId?: IntFieldUpdateOperationsInput | number
    deptId?: IntFieldUpdateOperationsInput | number
    compId?: IntFieldUpdateOperationsInput | number
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type PrivilegeDelegationUpdateWithoutDelegatorUserInput = {
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: DateTimeFieldUpdateOperationsInput | Date | string
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    delegateeUser?: UserUpdateOneRequiredWithoutDelegationFromNestedInput
    delegationDetails?: DelegationDetailUpdateManyWithoutDelegationNestedInput
  }

  export type PrivilegeDelegationUncheckedUpdateWithoutDelegatorUserInput = {
    id?: IntFieldUpdateOperationsInput | number
    delegateeUserId?: IntFieldUpdateOperationsInput | number
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: DateTimeFieldUpdateOperationsInput | Date | string
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    delegationDetails?: DelegationDetailUncheckedUpdateManyWithoutDelegationNestedInput
  }

  export type PrivilegeDelegationUncheckedUpdateManyWithoutDelegatorUserInput = {
    id?: IntFieldUpdateOperationsInput | number
    delegateeUserId?: IntFieldUpdateOperationsInput | number
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: DateTimeFieldUpdateOperationsInput | Date | string
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type PrivilegeDelegationUpdateWithoutDelegateeUserInput = {
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: DateTimeFieldUpdateOperationsInput | Date | string
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    delegatorUser?: UserUpdateOneRequiredWithoutDelegationToNestedInput
    delegationDetails?: DelegationDetailUpdateManyWithoutDelegationNestedInput
  }

  export type PrivilegeDelegationUncheckedUpdateWithoutDelegateeUserInput = {
    id?: IntFieldUpdateOperationsInput | number
    delegatorUserId?: IntFieldUpdateOperationsInput | number
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: DateTimeFieldUpdateOperationsInput | Date | string
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    delegationDetails?: DelegationDetailUncheckedUpdateManyWithoutDelegationNestedInput
  }

  export type PrivilegeDelegationUncheckedUpdateManyWithoutDelegateeUserInput = {
    id?: IntFieldUpdateOperationsInput | number
    delegatorUserId?: IntFieldUpdateOperationsInput | number
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: DateTimeFieldUpdateOperationsInput | Date | string
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type EmploymentCreateManyDeptartmentInput = {
    id?: number
    userId: number
    posId: number
    compId: number
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
  }

  export type EmploymentCreateManyCompanyInput = {
    id?: number
    userId: number
    posId: number
    deptId: number
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
  }

  export type OrganizationRoleCreateManyOrganizationInput = {
    roleId: number
  }

  export type EmploymentUpdateWithoutDeptartmentInput = {
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    user?: UserUpdateOneRequiredWithoutEmploymentsNestedInput
    company?: OrganizationUpdateOneRequiredWithoutCompEmploymentsNestedInput
    position?: PositionUpdateOneRequiredWithoutEmploymentsNestedInput
    roles?: EmploymentRoleUpdateManyWithoutEmploymentNestedInput
  }

  export type EmploymentUncheckedUpdateWithoutDeptartmentInput = {
    id?: IntFieldUpdateOperationsInput | number
    userId?: IntFieldUpdateOperationsInput | number
    posId?: IntFieldUpdateOperationsInput | number
    compId?: IntFieldUpdateOperationsInput | number
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    roles?: EmploymentRoleUncheckedUpdateManyWithoutEmploymentNestedInput
  }

  export type EmploymentUncheckedUpdateManyWithoutDeptartmentInput = {
    id?: IntFieldUpdateOperationsInput | number
    userId?: IntFieldUpdateOperationsInput | number
    posId?: IntFieldUpdateOperationsInput | number
    compId?: IntFieldUpdateOperationsInput | number
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type EmploymentUpdateWithoutCompanyInput = {
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    user?: UserUpdateOneRequiredWithoutEmploymentsNestedInput
    deptartment?: OrganizationUpdateOneRequiredWithoutDeptEmploymentsNestedInput
    position?: PositionUpdateOneRequiredWithoutEmploymentsNestedInput
    roles?: EmploymentRoleUpdateManyWithoutEmploymentNestedInput
  }

  export type EmploymentUncheckedUpdateWithoutCompanyInput = {
    id?: IntFieldUpdateOperationsInput | number
    userId?: IntFieldUpdateOperationsInput | number
    posId?: IntFieldUpdateOperationsInput | number
    deptId?: IntFieldUpdateOperationsInput | number
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    roles?: EmploymentRoleUncheckedUpdateManyWithoutEmploymentNestedInput
  }

  export type EmploymentUncheckedUpdateManyWithoutCompanyInput = {
    id?: IntFieldUpdateOperationsInput | number
    userId?: IntFieldUpdateOperationsInput | number
    posId?: IntFieldUpdateOperationsInput | number
    deptId?: IntFieldUpdateOperationsInput | number
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type OrganizationRoleUpdateWithoutOrganizationInput = {
    role?: RoleUpdateOneRequiredWithoutOrganizationsNestedInput
  }

  export type OrganizationRoleUncheckedUpdateWithoutOrganizationInput = {
    roleId?: IntFieldUpdateOperationsInput | number
  }

  export type OrganizationRoleUncheckedUpdateManyWithoutOrganizationInput = {
    roleId?: IntFieldUpdateOperationsInput | number
  }

  export type EmploymentCreateManyPositionInput = {
    id?: number
    userId: number
    deptId: number
    compId: number
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
  }

  export type PositionRoleCreateManyPositionInput = {
    roleId: number
  }

  export type EmploymentUpdateWithoutPositionInput = {
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    user?: UserUpdateOneRequiredWithoutEmploymentsNestedInput
    deptartment?: OrganizationUpdateOneRequiredWithoutDeptEmploymentsNestedInput
    company?: OrganizationUpdateOneRequiredWithoutCompEmploymentsNestedInput
    roles?: EmploymentRoleUpdateManyWithoutEmploymentNestedInput
  }

  export type EmploymentUncheckedUpdateWithoutPositionInput = {
    id?: IntFieldUpdateOperationsInput | number
    userId?: IntFieldUpdateOperationsInput | number
    deptId?: IntFieldUpdateOperationsInput | number
    compId?: IntFieldUpdateOperationsInput | number
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    roles?: EmploymentRoleUncheckedUpdateManyWithoutEmploymentNestedInput
  }

  export type EmploymentUncheckedUpdateManyWithoutPositionInput = {
    id?: IntFieldUpdateOperationsInput | number
    userId?: IntFieldUpdateOperationsInput | number
    deptId?: IntFieldUpdateOperationsInput | number
    compId?: IntFieldUpdateOperationsInput | number
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type PositionRoleUpdateWithoutPositionInput = {
    role?: RoleUpdateOneRequiredWithoutPositionsNestedInput
  }

  export type PositionRoleUncheckedUpdateWithoutPositionInput = {
    roleId?: IntFieldUpdateOperationsInput | number
  }

  export type PositionRoleUncheckedUpdateManyWithoutPositionInput = {
    roleId?: IntFieldUpdateOperationsInput | number
  }

  export type EmploymentRoleCreateManyEmploymentInput = {
    roleId: number
  }

  export type EmploymentRoleUpdateWithoutEmploymentInput = {
    role?: RoleUpdateOneRequiredWithoutEmploymentsNestedInput
  }

  export type EmploymentRoleUncheckedUpdateWithoutEmploymentInput = {
    roleId?: IntFieldUpdateOperationsInput | number
  }

  export type EmploymentRoleUncheckedUpdateManyWithoutEmploymentInput = {
    roleId?: IntFieldUpdateOperationsInput | number
  }

  export type RoleCreateManyClientInput = {
    id?: number
    roleCode: string
    roleName: string
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
  }

  export type RoleUpdateWithoutClientInput = {
    roleCode?: StringFieldUpdateOperationsInput | string
    roleName?: StringFieldUpdateOperationsInput | string
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    positions?: PositionRoleUpdateManyWithoutRoleNestedInput
    organizations?: OrganizationRoleUpdateManyWithoutRoleNestedInput
    employments?: EmploymentRoleUpdateManyWithoutRoleNestedInput
    privileges?: RolePrivilegeUpdateManyWithoutRoleNestedInput
  }

  export type RoleUncheckedUpdateWithoutClientInput = {
    id?: IntFieldUpdateOperationsInput | number
    roleCode?: StringFieldUpdateOperationsInput | string
    roleName?: StringFieldUpdateOperationsInput | string
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    positions?: PositionRoleUncheckedUpdateManyWithoutRoleNestedInput
    organizations?: OrganizationRoleUncheckedUpdateManyWithoutRoleNestedInput
    employments?: EmploymentRoleUncheckedUpdateManyWithoutRoleNestedInput
    privileges?: RolePrivilegeUncheckedUpdateManyWithoutRoleNestedInput
  }

  export type RoleUncheckedUpdateManyWithoutClientInput = {
    id?: IntFieldUpdateOperationsInput | number
    roleCode?: StringFieldUpdateOperationsInput | string
    roleName?: StringFieldUpdateOperationsInput | string
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type PositionRoleCreateManyRoleInput = {
    positionId: number
  }

  export type OrganizationRoleCreateManyRoleInput = {
    organizationId: number
  }

  export type EmploymentRoleCreateManyRoleInput = {
    employmentId: number
  }

  export type RolePrivilegeCreateManyRoleInput = {
    privilegeId: number
  }

  export type PositionRoleUpdateWithoutRoleInput = {
    position?: PositionUpdateOneRequiredWithoutRolesNestedInput
  }

  export type PositionRoleUncheckedUpdateWithoutRoleInput = {
    positionId?: IntFieldUpdateOperationsInput | number
  }

  export type PositionRoleUncheckedUpdateManyWithoutRoleInput = {
    positionId?: IntFieldUpdateOperationsInput | number
  }

  export type OrganizationRoleUpdateWithoutRoleInput = {
    organization?: OrganizationUpdateOneRequiredWithoutRolesNestedInput
  }

  export type OrganizationRoleUncheckedUpdateWithoutRoleInput = {
    organizationId?: IntFieldUpdateOperationsInput | number
  }

  export type OrganizationRoleUncheckedUpdateManyWithoutRoleInput = {
    organizationId?: IntFieldUpdateOperationsInput | number
  }

  export type EmploymentRoleUpdateWithoutRoleInput = {
    employment?: EmploymentUpdateOneRequiredWithoutRolesNestedInput
  }

  export type EmploymentRoleUncheckedUpdateWithoutRoleInput = {
    employmentId?: IntFieldUpdateOperationsInput | number
  }

  export type EmploymentRoleUncheckedUpdateManyWithoutRoleInput = {
    employmentId?: IntFieldUpdateOperationsInput | number
  }

  export type RolePrivilegeUpdateWithoutRoleInput = {
    privilege?: PrivilegeUpdateOneRequiredWithoutRolesNestedInput
  }

  export type RolePrivilegeUncheckedUpdateWithoutRoleInput = {
    privilegeId?: IntFieldUpdateOperationsInput | number
  }

  export type RolePrivilegeUncheckedUpdateManyWithoutRoleInput = {
    privilegeId?: IntFieldUpdateOperationsInput | number
  }

  export type PrivilegeCreateManyObjectInput = {
    id?: number
    privilegeCode: string
    privilegeName: string
    fieldValues?: NullableJsonNullValueInput | InputJsonValue
    status?: number
    description?: string | null
    isDelete?: boolean
    createTime?: Date | string
    updateTime?: Date | string
  }

  export type PrivilegeUpdateWithoutObjectInput = {
    privilegeCode?: StringFieldUpdateOperationsInput | string
    privilegeName?: StringFieldUpdateOperationsInput | string
    fieldValues?: NullableJsonNullValueInput | InputJsonValue
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    roles?: RolePrivilegeUpdateManyWithoutPrivilegeNestedInput
  }

  export type PrivilegeUncheckedUpdateWithoutObjectInput = {
    id?: IntFieldUpdateOperationsInput | number
    privilegeCode?: StringFieldUpdateOperationsInput | string
    privilegeName?: StringFieldUpdateOperationsInput | string
    fieldValues?: NullableJsonNullValueInput | InputJsonValue
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
    roles?: RolePrivilegeUncheckedUpdateManyWithoutPrivilegeNestedInput
  }

  export type PrivilegeUncheckedUpdateManyWithoutObjectInput = {
    id?: IntFieldUpdateOperationsInput | number
    privilegeCode?: StringFieldUpdateOperationsInput | string
    privilegeName?: StringFieldUpdateOperationsInput | string
    fieldValues?: NullableJsonNullValueInput | InputJsonValue
    status?: IntFieldUpdateOperationsInput | number
    description?: NullableStringFieldUpdateOperationsInput | string | null
    isDelete?: BoolFieldUpdateOperationsInput | boolean
    createTime?: DateTimeFieldUpdateOperationsInput | Date | string
    updateTime?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type RolePrivilegeCreateManyPrivilegeInput = {
    roleId: number
  }

  export type RolePrivilegeUpdateWithoutPrivilegeInput = {
    role?: RoleUpdateOneRequiredWithoutPrivilegesNestedInput
  }

  export type RolePrivilegeUncheckedUpdateWithoutPrivilegeInput = {
    roleId?: IntFieldUpdateOperationsInput | number
  }

  export type RolePrivilegeUncheckedUpdateManyWithoutPrivilegeInput = {
    roleId?: IntFieldUpdateOperationsInput | number
  }

  export type DelegationDetailCreateManyDelegationInput = {
    resourceCode: string
  }

  export type DelegationDetailUpdateWithoutDelegationInput = {
    resourceCode?: StringFieldUpdateOperationsInput | string
  }

  export type DelegationDetailUncheckedUpdateWithoutDelegationInput = {
    resourceCode?: StringFieldUpdateOperationsInput | string
  }

  export type DelegationDetailUncheckedUpdateManyWithoutDelegationInput = {
    resourceCode?: StringFieldUpdateOperationsInput | string
  }



  /**
   * Batch Payload for updateMany & deleteMany & createMany
   */

  export type BatchPayload = {
    count: number
  }

  /**
   * DMMF
   */
  export const dmmf: runtime.BaseDMMF
}