const GITHUB_API_VERSION = "2022-11-28";

export type GitHubRateLimitError = {
  type: "rate_limit";
  resetAt: Date;
  message: string;
};

export type GitHubAuthError = {
  type: "auth_error";
  status: number;
  message: string;
};

export type GitHubApiError = GitHubRateLimitError | GitHubAuthError | { type: "unknown"; message: string };

export function isRateLimitError(error: unknown): error is GitHubRateLimitError {
  return (error as GitHubRateLimitError)?.type === "rate_limit";
}

export function isAuthError(error: unknown): error is GitHubAuthError {
  return (error as GitHubAuthError)?.type === "auth_error";
}

async function handleGitHubResponse<T>(response: Response): Promise<T> {
  // Check for rate limiting
  const remaining = response.headers.get("x-ratelimit-remaining");
  const resetTimestamp = response.headers.get("x-ratelimit-reset");

  if (response.status === 403 && remaining === "0") {
    const resetAt = resetTimestamp ? new Date(parseInt(resetTimestamp) * 1000) : new Date();
    throw {
      type: "rate_limit",
      resetAt,
      message: `GitHub API rate limit exceeded. Resets at ${resetAt.toLocaleTimeString()}`,
    } as GitHubRateLimitError;
  }

  // Check for auth errors
  if (response.status === 401 || response.status === 403) {
    throw {
      type: "auth_error",
      status: response.status,
      message: response.status === 401 
        ? "GitHub authentication failed. Please re-authenticate."
        : "GitHub access forbidden. Check your token permissions.",
    } as GitHubAuthError;
  }

  if (!response.ok) {
    const text = await response.text();
    throw {
      type: "unknown",
      message: `GitHub API error (${response.status}): ${text}`,
    };
  }

  return response.json();
}

export async function githubFetch<T>(
  endpoint: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<T> {
  const url = endpoint.startsWith("http") 
    ? endpoint 
    : `https://api.github.com${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      ...options.headers,
    },
  });

  return handleGitHubResponse<T>(response);
}

export type GitHubRepoResponse = {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  description: string | null;
  private: boolean;
  fork: boolean;
  archived: boolean;
  html_url: string;
  clone_url: string;
  ssh_url: string;
  default_branch: string;
};

export type GitHubUserResponse = {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
};

export async function fetchUserRepos(accessToken: string): Promise<GitHubRepoResponse[]> {
  const repos: GitHubRepoResponse[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const pageRepos = await githubFetch<GitHubRepoResponse[]>(
      `/user/repos?per_page=${perPage}&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`,
      accessToken
    );

    repos.push(...pageRepos);

    if (pageRepos.length < perPage) {
      break;
    }
    page++;

    // Safety limit to prevent infinite loops
    if (page > 50) {
      console.warn("Stopped fetching repos at page 50 (safety limit)");
      break;
    }
  }

  return repos;
}

export async function fetchUser(accessToken: string): Promise<GitHubUserResponse> {
  return githubFetch<GitHubUserResponse>("/user", accessToken);
}

