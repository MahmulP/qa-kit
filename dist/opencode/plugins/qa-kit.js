// qa-kit for OpenCode: records Playwright runs started from the bash tool and shows the
// result to the agent. Installed by `qa-kit setup opencode` next to ../qa-kit/.
const kit = new URL('../qa-kit/lib/hooks.mjs', import.meta.url);

export const QaKit = async ({ directory, worktree }) => {
	const { postRunContext } = await import(kit.href);
	return {
		'tool.execute.after': async (input, output) => {
			if (input?.tool !== 'bash') return;
			const command = input?.args?.command ?? output?.metadata?.command ?? '';
			const text = postRunContext(worktree || directory, command, { requireCommand: Boolean(command) });
			if (text && typeof output?.output === 'string') output.output += '\n\n' + text;
		}
	};
};
