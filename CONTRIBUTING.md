# Contributing to Recipe Wizard

Thank you for your interest in contributing to Recipe Wizard! We welcome contributions from the community.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Code Style](#code-style)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Reporting Issues](#reporting-issues)
- [Pull Request Process](#pull-request-process)

## Getting Started

Before you begin:
- Make sure you have [Node.js](https://nodejs.org/) (v14 or higher) installed
- Familiarize yourself with React, Vite, and the other [technologies we use](README.md#-technologies-used)
- Read through the [README.md](README.md) to understand the project structure and features

## Development Setup

1. **Fork the repository** on GitHub

2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR-USERNAME/Recipe_Wizard.git
   cd Recipe_Wizard
   ```

3. **Add the upstream repository**:
   ```bash
   git remote add upstream https://github.com/cyberdataint/Recipe_Wizard.git
   ```

4. **Install dependencies**:
   ```bash
   npm install
   ```

5. **Set up environment variables**:
   
   Create a `.env` file in the root directory with the required API keys:
   ```env
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   VITE_SPOONACULAR_API_KEY=your_spoonacular_api_key
   VITE_GEMINI_API_KEY=your_google_gemini_api_key
   VITE_KROGER_CLIENT_ID=your_kroger_client_id
   VITE_KROGER_CLIENT_SECRET=your_kroger_client_secret
   ```

6. **Start the development server**:
   ```bash
   npm run dev
   ```

7. Open your browser to `http://localhost:5173`

## Project Structure

```
Recipe_Wizard/
├── src/
│   ├── App.jsx                      # Main application orchestrator
│   ├── main.jsx                     # React entry point
│   ├── Supabase.jsx                 # Supabase client configuration
│   ├── KrogerAPI.jsx                # Kroger API service with OAuth
│   ├── FavoritesAPI.jsx             # Supabase helpers for favorites
│   ├── components/                  # React components
│   │   ├── Recipes.jsx              # Recipe search functionality
│   │   ├── Pantry.jsx               # Pantry management
│   │   ├── ShoppingList.jsx         # Shopping list with pricing
│   │   ├── Chat.jsx                 # AI chatbot interface
│   │   ├── Auth.jsx                 # Authentication UI
│   │   └── TopNav.jsx               # Navigation bar
│   └── contexts/                    # React contexts
│       └── AuthContext.jsx          # Authentication provider
├── kroger-proxy-server.js           # Express server for Kroger API
├── functions/                       # Serverless functions
├── netlify/                         # Netlify-specific functions
└── public/                          # Static assets
```

## Development Workflow

1. **Create a new branch** for your feature or bugfix:
   ```bash
   git checkout -b feature/your-feature-name
   ```
   or
   ```bash
   git checkout -b fix/your-bugfix-name
   ```

2. **Keep your branch up to date** with upstream:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

3. **Make your changes** following our [code style guidelines](#code-style)

4. **Test your changes** thoroughly

5. **Lint your code** before committing:
   ```bash
   npm run lint
   ```

6. **Build the project** to ensure there are no build errors:
   ```bash
   npm run build
   ```

## Code Style

We use ESLint to maintain code quality and consistency. Please follow these guidelines:

### General Guidelines

- **ES6+ syntax**: Use modern JavaScript features (arrow functions, destructuring, etc.)
- **React Hooks**: Use functional components with hooks rather than class components
- **Component structure**: One component per file
- **File naming**: Use PascalCase for React components (e.g., `MyComponent.jsx`)
- **Variable naming**: Use camelCase for variables and functions

### ESLint Rules

Our project uses ESLint with the following configuration:
- ES2020+ JavaScript features
- React Hooks rules
- React Refresh rules for Vite
- Custom rules:
  - Unused variables must start with uppercase (e.g., `_unusedVar`)
  - Empty block statements are not allowed

### Running ESLint

```bash
# Check for linting errors
npm run lint

# Many errors can be auto-fixed (not all)
npm run lint -- --fix
```

### Code Formatting

- Use **2 spaces** for indentation (not tabs)
- Use **single quotes** for strings (unless you need template literals)
- Add **semicolons** at the end of statements
- Keep lines under **100 characters** when possible

### React Best Practices

- Use **functional components** with hooks
- Keep components **small and focused** on a single responsibility
- **Extract reusable logic** into custom hooks
- Use **PropTypes** or TypeScript for type checking (if applicable)
- Avoid inline styles; use CSS classes or CSS-in-JS solutions

### API Calls

- Always handle **errors gracefully**
- Use **try-catch** blocks for async operations
- Provide **user feedback** for loading states and errors
- Don't expose **API keys** in client-side code (use environment variables)

## Testing

Currently, this project doesn't have a formal test suite. However, when contributing:

### Manual Testing Requirements

1. **Test your changes** in the browser:
   - Recipe search functionality
   - Pantry management
   - Shopping list features
   - AI chat assistant
   - Authentication flow

2. **Test on multiple browsers** (Chrome, Firefox, Safari, Edge)

3. **Test responsive design** on different screen sizes

4. **Verify API integrations**:
   - Spoonacular API (recipe search)
   - Google Gemini AI (chat)
   - Kroger API (pricing)
   - Supabase (database and auth)

### Future Testing

We welcome contributions that add automated testing! Consider:
- Unit tests with Vitest or Jest
- Component tests with React Testing Library
- E2E tests with Cypress or Playwright

## Submitting Changes

### Before Submitting

- [ ] Code follows the [code style guidelines](#code-style)
- [ ] ESLint passes without errors (`npm run lint`)
- [ ] Project builds successfully (`npm run build`)
- [ ] Changes have been tested manually
- [ ] No sensitive information (API keys, passwords) is committed
- [ ] Commit messages are clear and descriptive

### Commit Messages

Write clear, concise commit messages that explain what and why:

```
Good examples:
- "Add ingredient quantity validation to pantry"
- "Fix shopping list price calculation bug"
- "Improve chat response formatting"

Bad examples:
- "update"
- "fix stuff"
- "asdf"
```

## Reporting Issues

### Bug Reports

When reporting a bug, please include:

1. **Clear title and description** of the issue
2. **Steps to reproduce** the problem
3. **Expected behavior** vs **actual behavior**
4. **Screenshots** (if applicable)
5. **Browser and OS** information
6. **Console errors** (if any)

Example:
```markdown
**Bug**: Shopping list prices not loading

**Steps to reproduce**:
1. Go to Shopping List tab
2. Add items to the list
3. Click "Get Prices" button

**Expected**: Prices should appear next to items
**Actual**: Loading spinner appears but prices never load

**Browser**: Chrome 120.0
**OS**: Windows 11
**Console Error**: `Failed to fetch: 401 Unauthorized`
```

### Feature Requests

When requesting a feature:

1. **Describe the feature** and its benefits
2. **Explain the use case** (why it's needed)
3. **Provide examples** or mockups (if applicable)
4. **Consider the scope** (is it within the project's goals?)

## Pull Request Process

1. **Update documentation** if you've changed functionality
   - Update README.md if needed
   - Add comments to complex code

2. **Ensure your PR**:
   - Has a clear title describing the change
   - Includes a description of what changed and why
   - References any related issues (e.g., "Fixes #123")
   - Passes all lint checks
   - Builds successfully

3. **PR Description Template**:
   ```markdown
   ## Description
   Brief description of the changes

   ## Type of Change
   - [ ] Bug fix
   - [ ] New feature
   - [ ] Breaking change
   - [ ] Documentation update

   ## Testing
   - [ ] Tested locally
   - [ ] Tested on multiple browsers
   - [ ] Tested responsive design

   ## Related Issues
   Fixes #(issue number)
   ```

4. **Review Process**:
   - Maintainers will review your PR
   - Address any feedback or requested changes
   - Once approved, your PR will be merged

5. **After Merging**:
   - Delete your feature branch
   - Pull the latest changes from upstream
   - Celebrate your contribution! 🎉

## Getting Help

- **Questions?** Open a [GitHub Discussion](https://github.com/cyberdataint/Recipe_Wizard/discussions)
- **Issues?** Check [existing issues](https://github.com/cyberdataint/Recipe_Wizard/issues) first
- **Need clarification?** Ask in your PR or issue comments

## Code of Conduct

Please be respectful and constructive in all interactions. We're all here to build something great together!

## License

By contributing to Recipe Wizard, you agree that your contributions will be licensed under the same license as the project.

---

Thank you for contributing to Recipe Wizard! Your efforts help make this project better for everyone. 🍳✨
