# Avatar runtime sources

The Cubism Core, Framework modules, shaders and notices in `vendor/` are copied
without modification from `suzuran0y/Cute-Partner` commit
`cfecb1949fc73d2bda43d506d0a5f0825b707d2a`, under `characters/default/web`.
`vendor-manifest.json` records every upstream Git blob and byte length;
`tools/prepare-avatar-sdk.ps1` verifies the original bytes when preparing them.

Original copyright headers and `vendor/sdk/LICENSE.md`, `CORE-LICENSE.md` and
`NOTICE.md` are retained. The repository's Apache-2.0 license does not replace
the upstream Cubism licenses. Character files remain in their existing directory
and keep their original provenance; this update does not relicense them.

The application driver and renderer are adapted from the architecture in
Cute-Partner, with a capability-based parameter mapping for the legacy model.
No character-specific binding count or texture count is imposed.
