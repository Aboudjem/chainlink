# Merge Conflict Resolution Task

You are resolving merge conflicts in a Git repository. The PR branch `{{PR_BRANCH}}` has merge conflicts with the base branch `{{BASE_BRANCH}}`.

## Your Task

1. **Identify all files with merge conflicts**
   - Look for Git conflict markers: `<<<<<<<`, `=======`, `>>>>>>>`
   - Use `git status` to see the list of conflicted files

2. **For each conflicting file:**
   - Analyze the changes from both branches
   - Understand the intent of each change
   - Resolve the conflict by intelligently combining changes
   - Remove ALL conflict markers after resolution
   - Ensure the code compiles and is syntactically correct

3. **Stage your changes**
   - Use `git add <file>` for each resolved file
   - Do NOT commit the changes - only stage them

## Important Guidelines

- **Preserve functionality** from both the base branch and PR branch
- **Do NOT arbitrarily delete code** - understand what each change does
- **Prefer the PR branch's intent** when changes directly conflict, as it represents the newer work
- **Maintain code consistency** - follow the existing style and patterns
- **Be thorough** - resolve ALL conflicts, don't leave any markers behind

## Common Conflict Patterns

### Import conflicts
Combine imports from both sides, removing duplicates.

### Function/method changes
If both branches modify the same function:
- Understand what each modification achieves
- Combine the logic if the modifications are compatible
- If incompatible, prefer the PR branch's version but preserve base branch additions that don't conflict

### Configuration changes
Merge configuration options from both sides, ensuring no duplicates.

### Version bumps
Generally take the higher version number.

## Verification

After resolving:
1. Ensure no conflict markers remain: `git diff --check`
2. Verify the code is syntactically valid
3. Stage all resolved files: `git add -A`

## Output

When complete, list:
- The files you resolved
- A brief summary of how you resolved each conflict
- Any concerns or areas that may need human review

