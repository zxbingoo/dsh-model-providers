# Third-party notices

## OpenAI Codex model catalog

`isolation/models.json` is an unmodified JSON model catalog retrieved from OpenAI Codex, tag `rust-v0.166.0`:

https://github.com/openai/codex/blob/rust-v0.166.0/codex-rs/models-manager/models.json

Copyright 2025 OpenAI. Distributed under the Apache License, Version 2.0. A copy of the upstream license and NOTICE is included in `third-party/`. Runtime-derived catalogs change model/tool metadata for Harness-only tool execution; the bundled original is not modified.

## Implementation references

The installed Paseo application's Codex app-server integration was studied for protocol and lifecycle behavior. This plugin's adapter and transport were implemented separately; no Paseo implementation source is bundled. The plugin is not affiliated with or endorsed by OpenAI, DeepSeek, or Paseo.
