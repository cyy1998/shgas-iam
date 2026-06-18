import type { UserService } from "@api/services/user/user.service";

export interface OpenServiceDeps {
  userService: Pick<UserService, "getUserDetailByUsername">;
}
