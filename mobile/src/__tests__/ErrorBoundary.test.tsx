import React from "react";
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { ErrorBoundary } from "../components/ErrorBoundary";

jest.mock("../lib/telemetry", () => ({ captureError: jest.fn() }));

function Boom(): React.ReactElement {
  throw new Error("render failed");
}

describe("ErrorBoundary", () => {
  beforeEach(() => jest.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it("renders children when nothing throws", async () => {
    await render(
      <ErrorBoundary>
        <Text>All good</Text>
      </ErrorBoundary>,
    );
    expect(screen.getByText("All good")).toBeTruthy();
  });

  it("shows the reload screen when a child throws", async () => {
    await render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Something went wrong")).toBeTruthy();
    expect(screen.getByLabelText("Reload the app")).toBeTruthy();
  });
});
