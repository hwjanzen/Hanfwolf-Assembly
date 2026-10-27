import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ROPE_CONFIG } from "./rope-configurator-config";
import {
  buildConfigurationSnapshot,
  configurationId,
  type ConfigurationInput,
} from "./rope-configuration";

const mocks = vi.hoisted(() => ({
  graphql: vi.fn(),
  load: vi.fn(),
  configuration: {
    upsert: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findFirst: vi.fn(),
  },
  selection: { upsert: vi.fn() },
}));
vi.mock("../db.server", () => ({
  default: {
    ropeConfiguration: mocks.configuration,
    ropeConfigurationSelection: mocks.selection,
  },
}));
vi.mock("./shopify-graphql.server", () => ({ adminGraphql: mocks.graphql }));
vi.mock("./rope-components.server", () => ({
  loadConfigurationProduct: mocks.load,
}));
import {
  getConfigurationStatus,
  prepareConfiguration,
} from "./rope-variant.server";

const input: ConfigurationInput = {
  productId: "gid://shopify/Product/1",
  quantity: 2,
  lengthDecimeters: 25,
  requestId: "a-valid-request-id-0001",
  selections: [],
};
const source = {
  productId: input.productId,
  sourceVariantId: "gid://shopify/ProductVariant/1",
  productTitle: "Seil",
  productHandle: "seil",
  currency: "EUR",
  taxable: true,
  basePricePerDecimeter: "0.10",
  baseWeightPerDecimeter: { value: 10, unit: "GRAMS" },
};
const snapshot = buildConfigurationSnapshot(input, source, [], []);
const id = configurationId("test.myshopify.com", snapshot);
const variantId = "gid://shopify/ProductVariant/100";
type Stored = {
  id: string;
  shop: string;
  productId: string;
  snapshot: string;
  variantId: string | null;
  status: string;
  error: string | null;
  leaseUntil: Date | null;
};
let record: Stored;

function loadResult(recovered = false) {
  return {
    currency: "EUR",
    positions: [],
    mappings: [],
    product: {
      id: input.productId,
      title: "Seil",
      handle: "seil",
      variants: {
        nodes: recovered
          ? [{ id: variantId, ropeConfiguration: { value: `v3|${id}` } }]
          : [],
      },
    },
    master: {
      id: source.sourceVariantId,
      price: "0.10",
      taxable: true,
      selectedOptions: [{ name: "Title", value: "Default Title" }],
      inventoryItem: { measurement: { weight: source.baseWeightPerDecimeter } },
    },
  };
}
function statusVariant() {
  return {
    id: variantId,
    price: "2.5",
    taxable: true,
    availableForSale: true,
    inventoryPolicy: "CONTINUE",
    inventoryItem: {
      tracked: false,
      requiresShipping: true,
      measurement: { weight: { value: 0.25, unit: "KILOGRAMS" } },
    },
    configuration: { value: `v3|${id}` },
    product: {
      id: input.productId,
      status: "ACTIVE",
      publishedAt: "2026-01-01",
    },
  };
}
const prepare = () =>
  prepareConfiguration(
    {},
    "test.myshopify.com",
    input,
    DEFAULT_ROPE_CONFIG,
    null,
  );

beforeEach(() => {
  vi.resetAllMocks();
  record = {
    id,
    shop: "test.myshopify.com",
    productId: input.productId,
    snapshot: JSON.stringify(snapshot),
    variantId: null,
    status: "pending",
    error: null,
    leaseUntil: null,
  };
  mocks.load.mockResolvedValue(loadResult());
  mocks.configuration.upsert.mockResolvedValue(record);
  mocks.selection.upsert.mockResolvedValue({
    configurationId: id,
    quantity: 2,
  });
  mocks.configuration.updateMany.mockImplementation(
    ({ data }: { data: Partial<Stored> }) => {
      Object.assign(record, data);
      return Promise.resolve({ count: 1 });
    },
  );
  mocks.configuration.findUniqueOrThrow.mockImplementation(() =>
    Promise.resolve(record),
  );
  mocks.configuration.findFirst.mockImplementation(() =>
    Promise.resolve(record),
  );
  mocks.graphql.mockResolvedValue({
    ok: true,
    data: {
      productVariantsBulkCreate: {
        productVariants: [{ id: variantId }],
        userErrors: [],
      },
    },
  });
});

describe("configuration preparation", () => {
  it("creates a piece-priced, untracked shipping variant and records the immutable selection", async () => {
    const result = await prepare();
    expect(result).toMatchObject({
      configurationId: id,
      variantId,
      unitPriceCents: 250,
      status: "checking",
    });
    expect(mocks.graphql.mock.calls[0][2].variants[0]).toMatchObject({
      price: "2.50",
      published: true,
      inventoryPolicy: "CONTINUE",
      inventoryItem: {
        tracked: false,
        requiresShipping: true,
        measurement: { weight: { value: 0.25, unit: "KILOGRAMS" } },
      },
      metafields: [{ value: `v3|${id}` }],
    });
    expect(mocks.selection.upsert.mock.calls[0][0].create).toMatchObject({
      quantity: 2,
      configurationId: id,
      customerId: null,
    });
  });

  it("does not create twice when a concurrent requester cannot acquire the lease", async () => {
    mocks.configuration.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    await Promise.all([prepare(), prepare()]);
    expect(mocks.graphql).toHaveBeenCalledTimes(1);
  });

  it("reuses an existing variant without creating or changing it", async () => {
    record.variantId = variantId;
    mocks.configuration.updateMany.mockResolvedValue({ count: 0 });
    expect((await prepare()).variantId).toBe(variantId);
    expect(mocks.graphql).not.toHaveBeenCalled();
  });

  it("recovers after a successful Shopify creation with a lost response", async () => {
    mocks.graphql.mockRejectedValueOnce(new Error("Connection lost"));
    await expect(prepare()).rejects.toThrow("Connection lost");
    expect(record.status).toBe("failed");
    expect(record.leaseUntil).toBeNull();
    mocks.load.mockResolvedValue(loadResult(true));
    expect((await prepare()).variantId).toBe(variantId);
    expect(mocks.graphql).toHaveBeenCalledTimes(1);
  });

  it("rejects a reused request ID with another selection or quantity before creating", async () => {
    mocks.selection.upsert.mockResolvedValue({
      configurationId: id,
      quantity: 3,
    });
    await expect(prepare()).rejects.toThrow("geändert");
    expect(mocks.graphql).not.toHaveBeenCalled();
    expect(mocks.configuration.updateMany).not.toHaveBeenCalled();
  });

  it("returns a retryable error for expired leases and isolates shops", async () => {
    record.status = "preparing";
    record.leaseUntil = new Date(Date.now() - 1);
    expect(await getConfigurationStatus({}, record.shop, id)).toMatchObject({
      status: "failed",
    });
    expect(mocks.configuration.findFirst).toHaveBeenCalledWith({
      where: { id, shop: record.shop },
    });
  });

  it("verifies price, weight, marker and inventory invariants before reporting availability", async () => {
    record.variantId = variantId;
    mocks.graphql.mockResolvedValue({
      ok: true,
      data: { productVariant: statusVariant() },
    });
    expect((await getConfigurationStatus({}, record.shop, id)).status).toBe(
      "available",
    );
    for (const changed of [
      { ...statusVariant(), price: "2.51" },
      { ...statusVariant(), configuration: { value: "v3|wrong" } },
      {
        ...statusVariant(),
        inventoryItem: { ...statusVariant().inventoryItem, tracked: true },
      },
    ]) {
      mocks.graphql.mockResolvedValue({
        ok: true,
        data: { productVariant: changed },
      });
      await expect(getConfigurationStatus({}, record.shop, id)).rejects.toThrow(
        "geändert",
      );
    }
  });
});
