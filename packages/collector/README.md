# Tetraforce Collector

Preview privacy-minimized Claude Code and Codex Token usage and connect this
device to a Tetraforce Character.

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

## Connect a Collector

Create a short-lived Device Code from the signed-in Tetraforce Temple. The
website shows the exact command for its service address:

```sh
TETRAFORCE_API_URL=https://your-tetraforce-service.example npx tetraforce init
```

`init` prints the summary count, complete pending JSON, and approved schema
before asking for explicit authorization. Declining makes no network request.
After confirmation, enter the one-time Device Code. The resulting device
credential is stored under the platform configuration directory with
owner-only permissions before the server activates it. An interrupted
activation can be resumed by running `init` again; an unpersisted pending
device expires without occupying an active-device slot.

The current `init` flow connects the device only. It does not upload Usage
Summaries or register an automatic task.

## Disconnect this device

```sh
npx tetraforce unlink
```

`unlink` asks for confirmation, revokes only this device credential, and then
removes the local credential and device-scoped secret. It does not delete the
Character or affect other connected devices. If five devices are already
active, run this command on one connected device before creating a new Device
Code.

## License

MIT
