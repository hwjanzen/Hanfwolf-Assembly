import { describe, expect, it } from "vitest";
import {
  cloneReleaseFieldsForProduct,
  parseRopeReleaseCsv,
  ropeReleasesToCsv,
  selectUnconfiguredCollectionTargets,
  type RopeRelease,
} from "./rope-releases.server";

describe("rope release CSV", () => {
  it("parses quoted values, commas, escaped quotes, and CRLF rows", () => {
    const records = parseRopeReleaseCsv(
      [
        "mapping_id,product_id,position_code,component_variant_id,label,quantity,sort_order,active",
        ',gid://shopify/Product/1,end_1,gid://shopify/ProductVariant/2,"Kausche, ""Edelstahl""",2,10,true',
      ].join("\r\n"),
    );

    expect(records).toEqual([
      {
        line: 2,
        values: {
          mapping_id: "",
          product_id: "gid://shopify/Product/1",
          position_code: "end_1",
          component_variant_id: "gid://shopify/ProductVariant/2",
          label: 'Kausche, "Edelstahl"',
          quantity: "2",
          sort_order: "10",
          active: "true",
        },
      },
    ]);
  });

  it("rejects malformed or incomplete CSV input", () => {
    expect(() => parseRopeReleaseCsv("mapping_id,product_id\nx,y")).toThrow(
      /CSV benötigt mapping_id/,
    );
    expect(() =>
      parseRopeReleaseCsv(
        'mapping_id,product_id,position_code,component_variant_id,label,quantity,sort_order,active\n,"unterminated',
      ),
    ).toThrow(/nicht geschlossenes Anführungszeichen/);
  });

  it("exports all required fields and neutralizes spreadsheet formulas", () => {
    const release: RopeRelease = {
      id: "gid://shopify/Metaobject/1",
      productId: "gid://shopify/Product/2",
      productTitle: "Seil",
      productHandle: "seil",
      positionCode: "end_1",
      positionLabel: "Endverbindung 1",
      componentVariantId: "gid://shopify/ProductVariant/3",
      componentVariantTitle: "Default",
      componentProductTitle: "Kausche",
      componentSku: "K-1",
      label: '=HYPERLINK("https://example.invalid")',
      quantity: 1,
      sortOrder: 10,
      active: true,
      linked: true,
    };

    expect(ropeReleasesToCsv([release])).toBe(
      [
        "mapping_id,product_title,product_handle,product_id,position_label,position_code,component_product_title,component_variant_title,component_sku,component_variant_id,label,quantity,sort_order,active",
        '"gid://shopify/Metaobject/1","Seil","seil","gid://shopify/Product/2","Endverbindung 1","end_1","Kausche","Default","K-1","gid://shopify/ProductVariant/3","\'=HYPERLINK(""https://example.invalid"")","1","10","true"',
      ].join("\r\n"),
    );
  });

  it("accepts readable export columns while retaining required import fields", () => {
    const records = parseRopeReleaseCsv(
      [
        "mapping_id,product_title,product_id,position_code,component_variant_id,label,quantity,sort_order,active",
        ",Seil A,gid://shopify/Product/1,end_1,gid://shopify/ProductVariant/2,Kausche,1,10,true",
      ].join("\r\n"),
    );

    expect(records[0].values.product_title).toBe("Seil A");
    expect(records[0].values.product_id).toBe("gid://shopify/Product/1");
  });

  it("allows readable product and SKU identifiers instead of Shopify GIDs", () => {
    const records = parseRopeReleaseCsv(
      [
        "mapping_id,product_handle,position_code,component_sku,label,quantity,sort_order,active",
        ",seil-a,end_1,K-100,Kausche,1,10,true",
      ].join("\r\n"),
    );

    expect(records[0].values.product_handle).toBe("seil-a");
    expect(records[0].values.component_sku).toBe("K-100");
  });

  it("selects only unconfigured collection products, excluding the master", () => {
    const targets = selectUnconfiguredCollectionTargets(
      [
        { id: "master", hasConfiguration: true },
        { id: "configured", hasConfiguration: true },
        { id: "empty-a", hasConfiguration: false },
        { id: "empty-b", hasConfiguration: false },
      ],
      "master",
    );

    expect(targets.map(({ id }) => id)).toEqual(["empty-a", "empty-b"]);
  });

  it("clones every release field but assigns the target product as base", () => {
    expect(
      cloneReleaseFieldsForProduct(
        [
          { key: "label", value: "Kausche" },
          { key: "base_product", value: "master-id" },
          { key: "position", value: "position-id" },
          { key: "component", value: "variant-id" },
          { key: "quantity", value: "2" },
          { key: "sort_order", value: "10" },
          { key: "active", value: "true" },
        ],
        "target-id",
      ),
    ).toEqual([
      { key: "label", value: "Kausche" },
      { key: "base_product", value: "target-id" },
      { key: "position", value: "position-id" },
      { key: "component", value: "variant-id" },
      { key: "quantity", value: "2" },
      { key: "sort_order", value: "10" },
      { key: "active", value: "true" },
    ]);
  });
});
