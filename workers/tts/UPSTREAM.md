# CosyVoice3 provenance and adaptation

The implementation draws on Cute-Partner's CosyVoice3 worker, host module, dependencies and asset lock. The public reference snapshot is `cfecb1949fc73d2bda43d506d0a5f0825b707d2a`. Dependency and asset records were also compared with the provided source at `da5f4c329f86f00fd6343ab5187c50f2430f3872`; required engine and model versions agree.

- [Cute-Partner worker](https://github.com/suzuran0y/Cute-Partner/blob/cfecb1949fc73d2bda43d506d0a5f0825b707d2a/apps/desktop/optional-modules/cosyvoice3/worker.py)
- [Cute-Partner asset lock](https://github.com/suzuran0y/Cute-Partner/blob/cfecb1949fc73d2bda43d506d0a5f0825b707d2a/apps/desktop/optional-modules/cosyvoice3/assets.lock.json)
- [CosyVoice engine](https://github.com/QwenAudio/CosyVoice/tree/074ca6dc9e80a2f424f1f74b48bdd7d3fea531cc)

The original Cute-Partner MIT license is retained in `CUTE-PARTNER-LICENSE`. Upstream engine, Matcha and model licenses continue to apply. This application does not redistribute their source trees, weights or example audio. The lock file records provenance and integrity, not additional redistribution rights.

Project adaptations include worker protocol v1, independently valid size-limited WAV chunks, acknowledgment backpressure, custom voice import and versioned feature caches, verified references to existing environments, confirmed cancellation and bounded prefetch.

Only natural style and default speaking speed are exposed. Upstream emotion/speed controls and Harness integration are not included.

References and feature caches stay in this application's user directory. External engines and weights are not modified; Python bytecode writing is disabled and upstream `save_spkinfo` is not called.
