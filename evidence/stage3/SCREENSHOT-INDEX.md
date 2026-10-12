# Stage 3 screenshots (final: round 4)

| File | Scenario | Viewport | Shows |
|---|---|---|---|
| chain-game-390.png | S1 | 390 | Review panel with the Execute deal button (viewport at the button, animations disabled) |
| chain-game-1440.png | S1 | 1440 | Review panel with Execute deal, Edit selection and the transfers table (viewport at the button, animations disabled) |
| chain-result-390.png | S1 | 390 | Confirmed result ("Everyone kept their promise."), before/after per person, transaction details |
| chain-result-1440.png | S1 | 1440 | Same at desktop width; proof panel (chain 31337, addresses, startRun and execute receipts, decoded events, final ledger balances) |
| chain-reload-restored-390.png | S1b | 390 | Reload with a preauthorised wallet: result restored from contracts, no Start run |
| chain-reload-restored-1440.png | S1b | 1440 | Same at desktop width |
| chain-incomplete-A-1440.png | S2 | 1440 | Only A selected: "This exchange would not work" naming B's promise, no Execute deal |
| chain-switch-account3-1440.png | S3 | 1440 | After switching to account 3: no run, Start run offered, no account-1 result |
| chain-switch-preview-1440.png | S3 | 1440 | Account 4 preview, switched to account 5: no send, no Execute |
| chain-switch-midop-1440.png | S3 | 1440 | Best effort: execute pending (automine off), account switched, block mined: invalidated-operation notice |
| chain-wrong-network-1440.png | S4 | 1440 | Wrong network (chain ID 1): Switch network offered, no execute path |
| chain-declined-1440.png | S5 | 1440 | "Wallet request" heading, "Request declined. Nothing was sent." |
| chain-rpc-failure-preview-1440.png | S6 | 1440 | "Local chain unreachable" with Retry; no "This exchange would not work" |
| chain-rpc-failure-1440.png | S6 | 1440 | Reload with RPC aborted: "Local chain unavailable" with Retry |
| chain-stale-preview-1440.png | S7 | 1440 | Notice "Your previewed exchange was not sent. This run was solved by another transaction (<external hash>)." with the restored result; no UI send |
| chain-deployment-missing-1440.png | S8 | 1440 | Anvil stopped, manifest missing: "Local deployment not usable" with the start/deploy command |
| demo-result-1440.png | S10 | 1440 | Demo mode result, no chain requests |
| chain-restart-execute-1440.png | S11 A | 1440 | Open page at preview-ready; Anvil restarted and redeployed; Execute clicked: deployment error shown, nothing sent |
| chain-restart-startrun-1440.png | S11 B | 1440 | Open page at no-run; Anvil restarted and redeployed; Start run clicked: deployment error shown, nothing sent |
| chain-cancelled-1440.png | S12 | 1440 | "Transaction cancelled" notice with original and replacement hashes; run not solved |
| chain-replaced-identical-1440.png | S12b | 1440 | Identical execute with higher fees mined: confirmed result, replacement shown in the proof panel |

S12b (PASS with limitation): the identical execute with higher fee shows the confirmed result; no visible replaced notice. The proof panel's Replacement group shows 'Original hash' and the main Hash row shows the mined replacement hash.
