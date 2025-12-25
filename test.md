# Test Markdown File

## Code Blocks

### JavaScript/TypeScript

```javascript
function greet(name: string): string {
  return `Hello, ${name}!`;
}

console.log(greet("World"));
```

### Python

```python
def fibonacci(n: int) -> list[int]:
    if n <= 1:
        return [0] if n == 1 else []
    return [0, 1] + [fibonacci(i)[-1] + fibonacci(i)[-2] for i in range(2, n)]

print(fibonacci(10))
```

### Java

```java
public class Calculator {
    private double result = 0.0;
    
    public void add(double value) {
        this.result += value;
    }
    
    public static void main(String[] args) {
        Calculator calc = new Calculator();
        calc.add(10.5);
        System.out.println("Result: " + calc.result);
    }
}
```

### C/C++

```cpp
#include <iostream>
#include <vector>

int main() {
    std::vector<int> numbers = {5, 2, 8, 1, 9};
    for (const auto& num : numbers) {
        std::cout << num << " ";
    }
    return 0;
}
```

### Rust

```rust
fn main() {
    let numbers = vec![1, 2, 3, 4, 5];
    let sum: i32 = numbers.iter().sum();
    println!("Sum: {}", sum);
}
```

### Go

```go
package main

import "fmt"

func main() {
    numbers := []int{1, 2, 3, 4, 5}
    sum := 0
    for _, n := range numbers {
        sum += n
    }
    fmt.Printf("Sum: %d\n", sum)
}
```

### HTML/CSS

```html
<!DOCTYPE html>
<html>
<head>
    <style>
        .card {
            background: #667eea;
            padding: 20px;
            border-radius: 10px;
        }
    </style>
</head>
<body>
    <div class="card">Hello, World!</div>
</body>
</html>
```

### SQL

```sql
CREATE TABLE users (
    id INT PRIMARY KEY,
    username VARCHAR(50) NOT NULL
);

INSERT INTO users VALUES (1, 'alice');
SELECT * FROM users WHERE id = 1;
```

### Bash/Shell

```bash
#!/bin/bash

for file in "$1"/*; do
    if [ -f "$file" ]; then
        echo "Processing: $file"
    fi
done
```

### JSON

```json
{
  "name": "typedown-markdown-editor",
  "version": "1.0.0",
  "dependencies": {
    "ckeditor5": "^40.0.0"
  }
}
```
---

## Table

| Name | Age | City |
|------|-----|------|
| Alice | 28 | New York |
| Bob | 35 | London |
| Charlie | 42 | Tokyo |

---

## Headings

# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6

## Text Formatting

This is a sample text with **bold words** and *italic words* to demonstrate formatting.