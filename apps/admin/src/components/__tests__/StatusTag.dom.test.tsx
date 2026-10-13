import { describe, expect, it } from "vitest";
import { render, screen } from "../../../test/render";
import StatusTag from "../StatusTag";

describe("StatusTag", () => {
  it("renders unknown status fallback", () => {
    const { rerender } = render(<StatusTag domain="user" status={null} />);

    expect(screen.getByText("未知")).toBeInTheDocument();

    rerender(<StatusTag domain="user" status={999} />);

    expect(screen.getByText("未知(999)")).toBeInTheDocument();
  });
});
