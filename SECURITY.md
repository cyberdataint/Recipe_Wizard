# Security Policy

## Supported Versions

We release patches for security vulnerabilities in the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 0.0.x   | :white_check_mark: |

**Note:** This project is currently in active development. We recommend using the latest version from the main branch for the most up-to-date security patches.

## Reporting a Vulnerability

We take the security of Recipe Wizard seriously. If you discover a security vulnerability, please follow these steps:

### How to Report

**Please DO NOT file a public issue** for security vulnerabilities.

Instead, please report security vulnerabilities by:

1. **Email**: Send details to the repository maintainer through GitHub
2. **GitHub Security Advisories**: Use the [GitHub Security Advisories](https://github.com/cyberdataint/Recipe_Wizard/security/advisories/new) feature (preferred method)

### What to Include

When reporting a vulnerability, please include:

- Description of the vulnerability
- Steps to reproduce the issue
- Potential impact of the vulnerability
- Any possible mitigations you've identified
- Your contact information for follow-up questions

### Response Timeline

- **Initial Response**: We aim to acknowledge receipt of your vulnerability report within 48 hours
- **Status Updates**: We will provide regular updates (at minimum every 7 days) on our progress
- **Resolution**: We aim to resolve critical vulnerabilities within 30 days

### Disclosure Policy

- We will work with you to understand and resolve the issue promptly
- We request that you give us reasonable time to address the vulnerability before public disclosure
- We will credit you in the security advisory (unless you prefer to remain anonymous)
- Once the vulnerability is patched, we will publish a security advisory

## Security Best Practices for Users

When using Recipe Wizard, please follow these security guidelines:

### Environment Variables

- Never commit your `.env` file to version control
- Keep your API keys secure and rotate them regularly
- Use different API keys for development and production environments

### API Keys

This application uses several third-party APIs. Secure your keys:

- **Supabase**: Use Row Level Security (RLS) policies
- **Spoonacular API**: Monitor usage and set rate limits
- **Google Gemini API**: Restrict API key usage to your domain
- **Kroger API**: Keep client secrets secure on the server side

### Dependencies

- Regularly update dependencies to get security patches
- Run `npm audit` to check for known vulnerabilities
- Review dependency updates before applying them

### Authentication

- Use strong passwords for your Supabase account
- Enable multi-factor authentication where available
- Regularly review and revoke unused API tokens

## Known Security Considerations

### Third-Party APIs

This application integrates with external APIs:
- Spoonacular API for recipe data
- Google Gemini AI for chat functionality
- Kroger API for pricing information
- Supabase for authentication and data storage

Users should review the security and privacy policies of these services.

### Data Storage

- User data is stored in Supabase (PostgreSQL)
- Ensure proper Row Level Security policies are configured
- Regularly backup your data

### Client-Side Security

- API keys prefixed with `VITE_` are exposed in the client bundle
- Use server-side proxies for sensitive API operations
- Implement proper CORS policies

## Security Updates

Security updates will be announced through:
- GitHub Security Advisories
- Release notes in GitHub Releases
- Updates to this SECURITY.md file

## Questions?

If you have questions about this security policy, please open a general issue (not for vulnerability reports) or contact the maintainers.

---

**Last Updated**: November 2025
