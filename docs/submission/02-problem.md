# 02. Problem (English, ready to paste)

Reviewer notes (Evidence: lines, local paths) are for verification; do not paste them into the portal.

## The problem

Two or more people can each make a trade conditional on the other side acting first. If A will hand over an item only after B hands over theirs, and B will do the same, neither has a reason to move first. Three participants can form the same kind of loop, and each promise can look fair when read on its own. The puzzle asks the player to find the combination in which every promise is kept.

When a settlement runs step by step, whoever goes first takes a risk on the others. The problem NOBODY FIRST explores is narrow: how a set of conditional promises can be checked as one deal, and how that deal can be applied so that either every step happens or none does.

## What the project is, and is not

- It is a puzzle prototype. The player picks which promises to combine, sees a preview of the exchange, and runs it. The public demo is a browser simulation of level 1 and sends no blockchain transaction.
- The Solidity prototype shows the same rules as contracts. It is tested locally on an EVM (Anvil) and is not deployed on a public network.
- We have not measured demand or a market for this idea. No user research, interviews or pilots are documented in the project.

Evidence: `contracts/SPEC.md` (the two promises, the observer and the coordinator); `contracts/README.md` (local tests only, no public deployment); `evidence/stage4/DEPLOYMENT.md` (public site is a static upload, no transactions); `/Users/mango/Downloads/NOBODY_FIRST_handoff_RU.txt` section 3 (the brief states that the same puzzle could be built on a server database transaction, and that uniqueness and market demand are not proven).

## Why a chain is used in the prototype (honest version)

A server database transaction can also make a multi-step deal all-or-nothing, and the original brief says so. The reason to use contracts in this prototype is different: each character's rules are published in a contract that the coordinator cannot change, and the result can be checked on a chain without trusting the game's own server. This is a design argument, not a measured benefit. The public demo does not show this property, and the Solidity code has run only on a local chain.

Evidence: `/Users/mango/Downloads/NOBODY_FIRST_handoff_RU.txt` section 3 (the same claim and its limits); `contracts/evidence/contracts/GUARANTEES.md` section 2 (which checks each contract makes itself, and which values it takes from the caller).
