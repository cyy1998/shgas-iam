import { listCustomAttributeDefinitions } from "@admin/services/custom-attribute";
import type { CustomAttributeDefinition, CustomAttributeEntityType } from "@iam/contracts/custom-attributes";
import { useEffect, useState } from "react";

type State =
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "ready";
      definitions: CustomAttributeDefinition[];
    };

export function useCustomAttributeDefinitions(entityType: CustomAttributeEntityType, open: boolean) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [version, setVersion] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Reload explicitly starts a fresh read for the same category.
  useEffect(() => {
    if (!open) return;
    let active = true;
    setState({ status: "loading" });
    void listCustomAttributeDefinitions(entityType).then(
      (definitions) => {
        if (active) setState({ status: "ready", definitions });
      },
      () => {
        if (active) setState({ status: "error" });
      },
    );
    return () => {
      active = false;
    };
  }, [open, entityType, version]);
  return { state, reload: () => setVersion((previous) => previous + 1) };
}
