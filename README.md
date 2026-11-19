# plumage

A Claude Code mod that draws each turn as a timeline, so that you can find failures, results, and questions at a glance.

## What it does

Each part of the mod answers one problem of a long session:

| Problem | Part |
| --- | --- |
| You cannot see where a turn starts and ends. | Turn timeline |
| You scroll back and cannot find your own prompt. | Turn timeline |
| A failed tool call hides between many rows that look the same. | Turn timeline |
| A result or a failure is hard to find in a long reply. | Severity sections |
| You come back to the terminal and do not know if something failed. | Band above the prompt |
| A question from Claude gets lost above the sections. | Band above the prompt |

The mod changes only the drawing. The stored conversation and the text that the model reads do not change. The timeline and the band draw only in the terminal. The other surfaces keep the drawing of Claude Code.

```
◆ fix the build and run the tests
│
├ ✓ Bash  npm run build 2s
├ ✗ Bash  npm test failed 5s
│   Error: Exit code 1
│
├ The tests fail in one file. Should I fix the test or the code?
│
├ ✗ Failures
│   - 2 tests failed in auth.test.ts.
│
├ ✓ Results
│   - The build passed.
│
╰─ Baked for 9s · 2 tools · 1 failed · 2:52 PM
```

### Turn timeline

- Your prompt opens the turn with a `◆`. A vertical line joins the turn, from the prompt to the closing line.
- Each tool call is a node. The mark and its color show the status: `…` while the call runs, `✓` on success, `✗` with `failed` on an error, and `■` with `interrupted` when you stop it.
- A node shows the main argument of the built-in tools: the command, the file path, the search pattern, the URL, or the agent description. A call that takes 1 second or more shows its duration.
- The mod opens the groups that Claude Code folds, such as `Read 3 files`, so each call has its own node.
- A call that succeeds shows no result. A call that fails shows the first line of its error. Edit, Write, and NotebookEdit keep the diff that Claude Code draws.
- The closing line sums up the turn: its length, the tool calls, the failures, and the time it ended. Its `╰─` takes the color of the worst status of the turn.
- Press `ctrl+o` to see the rows and results as Claude Code draws them.

### Severity sections

- Claude groups the facts of a reply under four heading lines: failures, results, skipped checks or risks, and neutral facts. Each heading line starts with a red, green, yellow, or blue circle emoji.
- Claude writes opinions, recommendations, and questions as plain text before the groups.
- In the timeline, each group is a node with a mark: `✗` for failures, `✓` for results, `!` for risks, and `•` for facts. Without the timeline, and in the desktop app, each group has a colored bar, a bold title, and a rule to the right margin.
- In the fullscreen terminal, a click on a title opens or closes its section. The desktop app draws every section open.
- On the main screen, a neutral-facts section with more than 6 lines shows its first 6 lines. Press `ctrl+o` to see the full reply.

### Band above the prompt

- After a reply, the band shows the failures and risks of the reply, with the title of each section and its number of list items, such as `✗ Failures 2  ! Risks 1`.
- The band shows `? Question` when the text before the sections ends with a question mark.
- The band hides while a turn runs, and when the reply has no failures, risks, or question.

### Theme

- The mod adds the **Plumage** theme, a dark theme in the Monokai colors. Choose it with `/theme`.
- Each text color has a contrast of 4.5:1 or more on the Monokai background, `#272822`.
- The spinner takes its colors from the theme.

## How Claude learns the headings

At the start of each conversation, the mod adds the heading rule to the context of Claude.

The context is set once for each conversation. After you install the mod, the rule applies to the next conversation, or after `/clear` or a compaction.

## Install

At the prompt of a terminal session:

```
/plugin install plumage --marketplace igorlau/plumage
```

Answer `y` to add the marketplace, then choose a scope.

From a shell:

```
claude plugin install plumage --marketplace igorlau/plumage
```

In the desktop app, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins**, then **Add marketplace** with `igorlau/plumage`, then **Add plugin**.

## Configure

Each part has an on and off switch. Run `/config` and find the rows of plumage:

| Field | Part |
| --- | --- |
| `timeline` | Turn timeline |
| `sections` | Severity sections, and the heading rule in the context of Claude |
| `band` | Band above the prompt |

All parts are on by default.

In a wide terminal, long lines are hard to read. To wrap the prose of Claude at a fixed width, set `maxProseWidth` in `~/.claude/settings.json`, for example `"maxProseWidth": 100`.

## Develop

Run a session with the mod loaded from your clone:

```
claude --plugin-dir /path/to/plumage
```

Check and test the mod:

```
claude plugin validate .
claude plugin test .
```

## Release

1. Change `version` in `.claude-plugin/plugin.json`.
2. Commit the change as `chore: release <version>`, and push it to `main`.

The `Release` workflow then runs `claude plugin validate .` and `claude plugin test .`. When both pass, it creates the tag `v<version>` and a GitHub release. The release notes list the commit subjects since the last tag. If the tag exists, the workflow does nothing. To run the workflow again, start it from the **Actions** tab.

## Limits

- The severity shows by color. Read the title of a section to know its severity if you do not see colors well.
- The cut of a long section counts Markdown source lines. A cut inside a code block can show the block without its closing fence.
- The band finds a question by the last character of the text before the sections. A rhetorical question also shows `▌ Question`.
- The theme does not change the background of the terminal. The contrast depends on the background that your terminal sets.
- The text that the mod writes itself, such as `failed` and `Question`, is in English.
- The timeline line stops at the rows that the mod cannot draw, such as the thinking block and permission prompts.
- The tool count of a turn also counts the calls of subagents that run in that turn.
- The rows of the replies keep the timeline in the `ctrl+o` view. The tool rows and results there are the ones of Claude Code.

## License

MIT
