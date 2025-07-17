#!/usr/bin/env python3
"""
Simple script to generate a secure random key for Flask's SECRET_KEY.
Run this script and add the output to your .env file.
"""

import os
import base64

# Generate a secure random key (32 bytes = 256 bits)
random_bytes = os.urandom(32)
# Convert to base64 for a printable string
secret_key = base64.b64encode(random_bytes).decode('utf-8')

print("\nGenerated SECRET_KEY for your .env file:\n")
print(f"FLASK_SECRET_KEY={secret_key}\n")
print("Copy the line above to your .env file.\n")