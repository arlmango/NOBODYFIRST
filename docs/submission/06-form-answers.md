# 06. Submission portal form answers (English, ready to paste)

Reviewer notes (Evidence: lines, local paths) are for verification; do not paste them into the portal.

Field list: `docs/submission/OFFICIAL-REQUIREMENTS.md` ("Submission portal fields"). Anything marked [USER TO FILL] or [USER TO CONFIRM] needs your input before submission. Nothing here has been submitted.

## 1. Product name and brief description

**Product name:** NOBODY FIRST

**Brief description:** See `01-short-description.md` (under-280-character version and about 100-word version).

Evidence: `docs/submission/01-short-description.md`.

## 2. Blockchains and tools integrated

Solidity 0.8.37; Foundry 1.8.5 (forge, cast, anvil); Anvil local EVM (chainId 31337); viem 2.57.4; React 19.3.0, Vite 8.3.4, TypeScript 7.0.2. No public chain is deployed. The public demo sends no blockchain transactions. The contract suite has 77 tests: 74 for NOBODY FIRST and 3 toolchain smoke tests.

Evidence: `package.json` (viem 2.57.4, react 19.3.0, vite 8.3.4, typescript 7.0.2); `contracts/evidence/contracts/versions.txt` (forge, cast, anvil 1.8.5; solc 0.8.37); `contracts/foundry.toml`; `contracts/evidence/contracts/GUARANTEES.md` section 6 (chainId 31337, not a public network).

## 3. Team members and their backgrounds

[USER TO FILL: for each team member, name, role, relevant background, and the Colosseum account email. Every member must have a Colosseum account; the team leader adds them in the portal.]

Evidence: `docs/submission/OFFICIAL-REQUIREMENTS.md` (field 3, FAQ).

## 4. Team location

[USER TO FILL: city and country of the team. Note for the team: eligibility excludes persons located or ordinarily resident in the sanctioned countries and regions listed in the rules (section 3); only you can confirm this.]

Evidence: `docs/submission/OFFICIAL-REQUIREMENTS.md` (field 4; "Eligibility", rules section 3).

## 5. Logo or graphic

[USER TO FILL: choose one image file. There is no dedicated logo yet. Candidates are listed in `docs/submission/INVENTORY.md` (portrait crops, the character sheet, a screenshot). Check the rights of any image before use.]

Evidence: `docs/submission/INVENTORY.md` ("Logo and graphic").

## 6. GitHub repository link

[USER TO FILL: repository URL.]

Note for the team: the repository https://github.com/arlmango/NOBODYFIRST exists and is private (an unauthenticated request returns 404, as GitHub does for private repositories). Its first published commit is `0daf26d` on `main`. The FAQ allows a private repository if access is granted to hackathon@colosseum.com; that access has not been confirmed. No license file exists yet.

Evidence: `OFFICIAL-REQUIREMENTS.md` (field 6, FAQ on private repositories); `git remote -v`, `git log` and `docs/submission/INVENTORY.md` ("Repository state").

## 7. Pitch video (2 to 3 minutes)

[USER TO FILL: video URL. No video exists yet. The script is written (`docs/submission/08-pitch-video-script.md`); the video is not recorded.]

Evidence: `docs/submission/OFFICIAL-REQUIREMENTS.md` (field 7); `docs/submission/INVENTORY.md` ("Video").

## 8. Product-demo video (up to 3 minutes)

[USER TO FILL: video URL. No video exists yet. The script is written (`docs/submission/07-demo-video-script.md`); the video is not recorded.]

Evidence: `docs/submission/OFFICIAL-REQUIREMENTS.md` (field 8); `docs/submission/INVENTORY.md` ("Video").

## 9. Go-to-market strategy, demand validation and plans for developing distribution

Official field text: "Go-to-market strategy, demand validation and plans for developing distribution".

**Draft (honest; edit with the team):**

Demand is not validated. The project has no users, interviews, pilot partners, waiting list, traffic or sales data. The current product is a free browser puzzle with a local Solidity prototype. No revenue model is defined. The project brief names Ethernaut and Tact as reference points, and we have not analysed the market beyond that.

Next step, to be decided by the team: [USER TO FILL: the first audience to test with, and the one measurable test that would show interest, for example a number of people who finish level 1 and a short survey]. Until that test is run, no claim about demand should be made.

**Plans for developing distribution [USER TO CONFIRM]:** Distribution has not been built or tested. The planned first step is to share the public demo link with [USER TO FILL: channels or communities] and ask players for feedback on level 1 through [USER TO FILL: feedback method]. No distribution channel has been tried, and no results exist yet.

Evidence: `/Users/mango/Downloads/NOBODY_FIRST_handoff_RU.txt` section 3 ("Uniqueness and market demand are not yet proven"; reference links); `docs/submission/OFFICIAL-REQUIREMENTS.md` (field 9, not verified).

## Track selection

**NOT SELECTED — see `docs/submission/09-requirements-matrix.md`.**

The project has no public-chain deployment, so no ecosystem track can be claimed as met on the current evidence. The choice belongs to the team.

Evidence: `docs/submission/OFFICIAL-REQUIREMENTS.md` (section "Tracks").

## Additional question: open-source license (judging criterion, not a portal field)

[USER TO FILL: license for the repository.]

Note for the team (USER action): there is no LICENSE file in the project, but the `.sol` files carry `SPDX-License-Identifier: MIT`. Add a LICENSE file that matches that header, or change the headers.

Evidence: `docs/submission/INVENTORY.md` ("License").

## Pre-existing work: disclosure paragraph (draft)

[USER TO CONFIRM every sentence below before use.]

NOBODY FIRST was designed and built during this hackathon window, starting from an empty folder. Earlier code is not reused. Development was done with heavy use of AI coding assistants (including Claude Code), which wrote and reviewed much of the code and tests under the team's direction. The visual mock-ups were generated with an image tool. A separate earlier project (Signor Scam) is not part of this submission. [USER TO CONFIRM: any earlier code, assets, or designs that were reused; the exact tools; and the start date of the work.]

Evidence: `docs/submission/OFFICIAL-REQUIREMENTS.md` (pre-existing work allowed if disclosed; AI tooling policy not found); `/Users/mango/Downloads/nobody-first-design/DESIGN-HANDOFF.md` (mock-ups made with the built-in image generator); `git log` in `/Users/mango/NOBODYFIRST` (first commit `0daf26d`); the scope of the Signor Scam project is from the user's instruction, not from a file.
