# Data Voyager Bridge

A simple web application to facilitate data ingestion between a ClickHouse database and local Flat Files (CSV).

![image](https://github.com/user-attachments/assets/17494d0e-c2b7-472d-b2a9-5de515f868bb)


## Features

- Bidirectional data flow: ClickHouse <-> Flat File.
- Web UI for configuration and triggering ingestion.
- Connect to ClickHouse using Host/Port/Database/User/Password or JWT Token (via HTTP `Authorization: Bearer` header).
- Fetches table lists from ClickHouse.
- Fetches column names from ClickHouse tables or detects columns from Flat File headers.
- Allows selection of specific columns for ingestion.
- Reports the total number of records processed.
- Basic automatic table creation (Flat File -> ClickHouse) based on inferred schema (requires header row).
- Input validation for file paths (restricted to a `data_files` subdirectory).
- JWT Token validation (HS256 algorithm by default).

## Setup

1.  **Prerequisites:**

    - Python 3.8+ recommended.
    - `pip` (Python package installer).

2.  **Clone the Repository (if applicable):**

    ```bash
    git clone https://github.com/aditramdas/data-voyager-bridge
    cd data-voyager-bridge
    ```

3.  **Create a Virtual Environment (Recommended):**

    ```bash
    python -m venv venv
    # Activate the environment
    # Windows (cmd/powershell):
    .\venv\Scripts\activate
    # Linux/macOS (bash/zsh):
    source venv/bin/activate
    ```

4.  **Install Dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

## Configuration

1.  **JWT Secret Key (Mandatory for JWT Authentication):**

    - The application uses a secret key to validate JWT tokens. You **MUST** set this securely.
    - **Option 1 (Environment Variable - Recommended):** Set the `JWT_SECRET_KEY` environment variable:
      ```bash
      # Linux/macOS
      export JWT_SECRET_KEY="your_very_strong_and_secret_key_here"
      # Windows (cmd)
      set JWT_SECRET_KEY="your_very_strong_and_secret_key_here"
      # Windows (PowerShell)
      $env:JWT_SECRET_KEY="your_very_strong_and_secret_key_here"
      ```
    - **Option 2 (Edit `app.py` - Less Secure):** If you cannot use environment variables, directly edit the `JWT_SECRET_KEY` variable near the top of `app.py`. **This is not recommended for production.**
    - **Warning:** The application will log a critical warning on startup if run outside of debug mode with the default placeholder key.

2.  **Data Files Directory (`data_files`):**
    - All flat file operations (reading source files, writing target files) are restricted to a subdirectory named `data_files` located in the same directory as `app.py`.
    - The application will attempt to create this directory on startup if it doesn't exist.
    - Ensure the user running the application has **read and write permissions** for this `data_files` directory.
    - When specifying file paths in the UI, use paths _relative_ to this `data_files` directory (e.g., `input/my_data.csv`, `output/result.csv`). Do **not** use absolute paths or paths with `../`.

## Running the Application

1.  **Ensure Virtual Environment is Active** (if you created one).
2.  **Set Environment Variables** (especially `JWT_SECRET_KEY` if needed).
3.  **Run the Flask Development Server:**
    ```bash
    # For development (enables debug mode, auto-reload)
    export FLASK_ENV=development # Linux/macOS
    set FLASK_ENV=development   # Windows (cmd)
    $env:FLASK_ENV="development" # Windows (PowerShell)
    flask run
    # OR explicitly run the script
    python app.py
    ```
4.  **Access the UI:** Open your web browser and navigate to `http://127.0.0.1:5000` (or `http://0.0.0.0:5000` if accessed from another machine on your network).

**Note on Production:** The default Flask development server is not suitable for production use. For deployment, consider using a production-grade WSGI server like Gunicorn or uWSGI behind a reverse proxy like Nginx.
