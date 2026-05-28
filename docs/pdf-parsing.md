# PDF Parsing Notes

## Byte Normalization

`extractBookFromPdf` receives private Blob downloads as Node `Buffer` instances.
Before handing those bytes to `pdfjs-dist`, keep them as a plain `Uint8Array`
view over the same `ArrayBuffer` instead of cloning them with
`new Uint8Array(buffer)`.

That distinction matters on large uploads. The parse step already holds the full
PDF in memory after the Blob download; copying the `Buffer` again roughly
doubles peak memory during parsing without improving extraction fidelity.

When changing this path:

- Prefer shared `Uint8Array` views for `Buffer` or other `Uint8Array` subclasses.
- Only make a full copy if a downstream library requires mutable isolated bytes.
- Keep the regression test in `tests/pdf.test.ts` passing so Buffer-backed inputs
  continue to reach pdfjs without an extra allocation.
