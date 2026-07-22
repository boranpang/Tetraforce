# Tetraforce Collector

Preview privacy-minimized Claude Code and Codex Token usage before any upload.

## Requirements

- Node.js 22 or newer
- macOS or Linux

Native Windows is not supported. Tetraforce does not provide manual Token
entry or log-file upload as an alternative.

## Preview local data

```sh
npx tetraforce show-data
```

`show-data` automatically discovers both supported Agents and prints the
complete pending JSON for the current UTC hour and previous 23 hours. The
command does not upload data or call the Tetraforce service.

The JSON contains only a device-scoped summary key, Agent, UTC hour, four
cumulative Token counters, Collector version, and source-log format version.
It never contains conversation content, code, commands, project or file
details, user or device names, session IDs, precise call times, models, or
costs.

## License

MIT
