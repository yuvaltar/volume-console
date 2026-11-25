import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { createMockApi } from "./api/mockApi";

const setup = (count = 60) => {
  const api = createMockApi({ count, latency: 5 });
  const user = userEvent.setup();
  render(<App api={api} />);
  return { api, user };
};

const table = () => screen.findByRole("table");

describe("Volume Console", () => {
  it("shows a loading state, then the table", async () => {
    setup();
    expect(screen.getByText("Loading volumes")).toBeInTheDocument();
    const t = await table();
    expect(within(t).getAllByRole("row").length).toBe(26); // header + 25 rows
  });

  it("sorts when a column header is clicked and exposes aria-sort", async () => {
    const { user } = setup();
    await table();
    const header = screen.getByRole("columnheader", { name: /size/i });
    expect(header).toHaveAttribute("aria-sort", "none");
    await user.click(within(header).getByRole("button"));
    expect(header).toHaveAttribute("aria-sort", "ascending");
    await user.click(within(header).getByRole("button"));
    expect(header).toHaveAttribute("aria-sort", "descending");
  });

  it("shows a no-results state that can clear the filters", async () => {
    const { user } = setup();
    await table();
    await user.type(screen.getByRole("searchbox", { name: /search volumes/i }), "zzz-no-such-volume");
    expect(await screen.findByText("No volumes match these filters")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Clear filters" })[0]);
    expect(await table()).toBeInTheDocument();
  });

  it("shows an error state with retry, and recovers", async () => {
    const { api, user } = setup();
    await table();
    await user.selectOptions(screen.getByRole("combobox", { name: /demo scenario/i }), "error");
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load volumes");
    api.setScenario("normal");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await table()).toBeInTheDocument();
  });

  it("distinguishes an empty account from an empty search", async () => {
    const { user } = setup();
    await table();
    await user.selectOptions(screen.getByRole("combobox", { name: /demo scenario/i }), "empty");
    expect(await screen.findByText("No volumes yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create your first volume" })).toBeInTheDocument();
  });

  it("validates the create form, focuses the first error, then creates the volume", async () => {
    const { user } = setup();
    await table();
    await user.click(screen.getByRole("button", { name: "+ Create volume" }));
    await user.click(screen.getByRole("button", { name: "Create volume" }));
    const name = screen.getByLabelText("Name");
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveAccessibleDescription("Enter a volume name.");
    await waitFor(() => expect(name).toHaveFocus());

    await user.type(name, "new-volume");
    await user.selectOptions(screen.getByLabelText("Cluster"), "cluster-tlv-01");
    await user.selectOptions(screen.getByLabelText("Protocol"), "SMB");
    await user.type(screen.getByLabelText("Size"), "2");
    await user.selectOptions(screen.getByLabelText("Size unit"), "TiB");
    expect(screen.getByLabelText("Size")).toHaveAccessibleDescription("Will be provisioned as 2.0 TiB.");
    await user.click(screen.getByRole("button", { name: "Create volume" }));

    expect(await screen.findByText(/new-volume is being provisioned/)).toBeInTheDocument();
    expect(within(await table()).getByText("new-volume")).toBeInTheDocument();
  });

  it("reports partial failures in bulk actions and keeps the failed rows selected", async () => {
    const { user } = setup();
    await table();
    await user.selectOptions(screen.getByRole("combobox", { name: /demo scenario/i }), "flaky");
    await table();
    // Only online volumes, so every failure comes from the flaky network and not from an offline volume.
    await user.click(screen.getByRole("checkbox", { name: "Online" }));
    const rows = within(await table()).getAllByRole("checkbox").slice(1, 5);
    for (const r of rows) await user.click(r);
    await user.click(screen.getByRole("button", { name: "Take snapshot" }));
    expect(await screen.findByText(/2 snapshots taken, 2 failed/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Bulk actions" })).toHaveTextContent("2 selected");
  });
});
