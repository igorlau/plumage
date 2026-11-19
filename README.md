# plumage

A Claude Code mod that draws the replies of Claude as colored sections, grouped by severity.

## What it does

- Claude groups the facts of a reply under four heading lines: failures, results, skipped checks or risks, and neutral facts. Each heading line starts with a red, green, yellow, or blue circle emoji.
- The mod draws each group as a section: a colored bar, a bold title, and a rule to the right margin. The body has an indent of 2 columns and keeps its Markdown.
- In the fullscreen terminal, a click on a title opens or closes its section.
- On the main screen, a neutral-facts section with more than 6 lines shows its first 6 lines. Press `ctrl+o` to see the full reply.
- A reply with no heading lines draws as Claude Code draws it.

The mod changes only the drawing. The stored conversation and the text that the model reads do not change.

## How Claude learns the headings

At the start of each conversation, the mod reads the context blocks, such as your `CLAUDE.md` files. If no block mentions all four circle emoji, the mod adds a short block with the heading rule. If your own instructions already have such a rule, the mod adds nothing.

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

## Limits

- The severity shows by color. Read the title of a section to know its severity if you do not see colors well.
- The cut of a long section counts Markdown source lines. A cut inside a code block can show the block without its closing fence.

## License

MIT
