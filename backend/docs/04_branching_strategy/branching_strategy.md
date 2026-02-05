# SmartEats Branching Strategy

## Branch Naming Conventions

We use prefixed branch names to clearly indicate the purpose of each branch:

| Prefix | Purpose | Example |
|--------|---------|---------|
| `feature/` | New features or enhancements | `feature/meal-tracking` |
| `bugfix/` | Bug fixes | `bugfix/login-validation` |
| `hotfix/` | Urgent production fixes | `hotfix/security-patch` |
| `docs/` | Documentation updates | `docs/api-documentation` |

## Workflow

1. **Create Branch**: Branch off from `main` using the appropriate prefix
   ```bash
   git checkout main
   git pull origin main
   git checkout -b feature/your-feature-name
   ```

2. **Develop**: Make changes with frequent, meaningful commits
   - Write clear commit messages describing what changed and why
   - Keep commits focused on a single logical change

3. **Push & Review**: Push branch to remote and create a pull request
   ```bash
   git push -u origin feature/your-feature-name
   ```

4. **Merge**: After review/approval, merge into `main`
   - Use merge commits to preserve branch history
   - Delete the feature branch after merging

5. **Clean Up**: Remove merged branches locally
   ```bash
   git branch -d feature/your-feature-name
   ```

## Protected Main Branch

- `main` is the stable, production-ready branch
- All changes to `main` should come through pull requests or reviewed merges
- Never force-push to `main`

## Commit Message Guidelines

Use clear, descriptive commit messages:

```
<type>: <short description>

<optional longer description>
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

Example:
```
feat: add meal nutrition tracking view

Implements the meal list view with calorie and macro display
for the mealPlanning app.
```
