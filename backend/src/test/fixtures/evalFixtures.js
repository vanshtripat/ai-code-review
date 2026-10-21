'use strict';
/**
 * AI Evaluation Fixtures — Day 17
 *
 * Synthetic source code samples for testing AI analysis quality.
 * These are TEST FIXTURES ONLY. They are NOT real user reviews.
 * Do not display these to users as real review data.
 *
 * Each fixture includes:
 *   - code: the source code string
 *   - language: programming language
 *   - focus: review focus area
 *   - description: what this fixture is intended to exercise
 *   - expectations: broad behavioral expectations (not exact wording)
 */

const evalFixtures = [
  // ── 1. Clean JavaScript ──────────────────────────────────────────────────
  {
    id: 'js_clean',
    language: 'javascript',
    focus: 'all',
    description: 'Simple, clean JavaScript utility function with no significant issues',
    code: `/**
 * Formats a number as currency string.
 * @param {number} amount
 * @param {string} currency
 * @returns {string}
 */
function formatCurrency(amount, currency = 'USD') {
  if (typeof amount !== 'number' || isNaN(amount)) {
    throw new TypeError('Amount must be a valid number');
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency
  }).format(amount);
}

module.exports = { formatCurrency };
`,
    expectations: {
      // Clean code should not have many serious issues
      maxCriticalOrHighIssues: 0,
      // Score should be reasonably high for clean code
      minScore: 60,
      // Summary should be present
      requiresSummary: true
    }
  },

  // ── 2. Buggy JavaScript ──────────────────────────────────────────────────
  {
    id: 'js_buggy',
    language: 'javascript',
    focus: 'bugs',
    description: 'JavaScript function with a divide-by-zero and off-by-one bug',
    code: `function getAverage(numbers) {
  let sum = 0;
  for (let i = 0; i <= numbers.length; i++) {
    sum += numbers[i];
  }
  return sum / numbers.length;
}

function getPercentage(part, total) {
  return (part / total) * 100;
}
`,
    expectations: {
      // Should identify at least one correctness issue (off-by-one, divide by zero)
      minIssues: 1,
      requiresSummary: true
    }
  },

  // ── 3. Security Issue (JavaScript) ──────────────────────────────────────
  {
    id: 'js_security',
    language: 'javascript',
    focus: 'security',
    description: 'Node.js Express route with SQL injection vulnerability (string concatenation in query)',
    code: `const express = require('express');
const db = require('./db');
const router = express.Router();

router.get('/user', async (req, res) => {
  const username = req.query.username;
  const query = "SELECT * FROM users WHERE username = '" + username + "'";
  const result = await db.query(query);
  res.json(result.rows);
});

module.exports = router;
`,
    expectations: {
      // Must identify the SQL injection
      minIssues: 1,
      requiresSummary: true
    }
  },

  // ── 4. Performance Issue (Python) ────────────────────────────────────────
  {
    id: 'py_performance',
    language: 'python',
    focus: 'performance',
    description: 'Python function with O(n²) loop that should use a set for O(n) membership test',
    code: `def find_duplicates(items):
    duplicates = []
    for i in range(len(items)):
        for j in range(len(items)):
            if i != j and items[i] == items[j] and items[i] not in duplicates:
                duplicates.append(items[i])
    return duplicates

def main():
    data = list(range(1000)) + list(range(500))
    result = find_duplicates(data)
    print(f"Found {len(result)} duplicates")
`,
    expectations: {
      // Should identify the O(n²) inefficiency
      minIssues: 1,
      requiresSummary: true
    }
  },

  // ── 5. Code Quality Issue (JavaScript) ───────────────────────────────────
  {
    id: 'js_quality',
    language: 'javascript',
    focus: 'code_quality',
    description: 'JavaScript with poor naming, deep nesting, and magic numbers',
    code: `function p(d) {
  let r = [];
  for (let i = 0; i < d.length; i++) {
    if (d[i].s === 1) {
      if (d[i].a > 18) {
        if (d[i].c > 0) {
          r.push(d[i]);
        }
      }
    }
  }
  return r;
}
`,
    expectations: {
      // Should identify naming and readability issues
      minIssues: 1,
      requiresSummary: true
    }
  },

  // ── 6. Clean Python ───────────────────────────────────────────────────────
  {
    id: 'py_clean',
    language: 'python',
    focus: 'all',
    description: 'Clean Python dataclass with type hints and docstring',
    code: `from dataclasses import dataclass
from typing import Optional


@dataclass
class User:
    """Represents an authenticated user in the system."""
    user_id: int
    username: str
    email: str
    is_active: bool = True
    role: Optional[str] = None

    def is_admin(self) -> bool:
        """Returns True if this user has admin privileges."""
        return self.role == 'admin'

    def deactivate(self) -> None:
        """Deactivates the user account."""
        self.is_active = False
`,
    expectations: {
      // Clean Python code should have low severity issues only
      maxCriticalOrHighIssues: 0,
      minScore: 60,
      requiresSummary: true
    }
  },

  // ── 7. TypeScript — Type Safety Issue ────────────────────────────────────
  {
    id: 'ts_type_safety',
    language: 'typescript',
    focus: 'bugs',
    description: 'TypeScript with any types defeating the purpose of TS and potential null dereference',
    code: `interface ApiResponse {
  data: any;
  status: number;
}

function processUser(response: any) {
  const user = response.data.user;
  const name = user.name.toUpperCase();
  const age = parseInt(user.age);
  return { name, age };
}

async function fetchUser(id: any): Promise<any> {
  const response = await fetch(\`/api/users/\${id}\`);
  return processUser(response.json());
}
`,
    expectations: {
      // Should identify the any usage and null dereference risks
      minIssues: 1,
      requiresSummary: true
    }
  },

  // ── 8. Java — Resource Leak ───────────────────────────────────────────────
  {
    id: 'java_resource_leak',
    language: 'java',
    focus: 'bugs',
    description: 'Java code with a resource leak (InputStream not closed in finally block)',
    code: `import java.io.*;
import java.net.*;

public class FileDownloader {
    public String download(String urlString) throws IOException {
        URL url = new URL(urlString);
        InputStream stream = url.openStream();
        BufferedReader reader = new BufferedReader(new InputStreamReader(stream));
        StringBuilder content = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) {
            content.append(line);
        }
        return content.toString();
        // stream is never closed on success or exception
    }
}
`,
    expectations: {
      // Should identify the unclosed resource
      minIssues: 1,
      requiresSummary: true
    }
  }
];

module.exports = evalFixtures;
