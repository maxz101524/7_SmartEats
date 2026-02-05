# SmartEats: AI-Powered Nutrition Analytics for University Dining

## Project Overview

SmartEats is a web application designed to help university students make informed dietary choices. The app extracts and analyzes nutritional data from campus dining hall menus, providing detailed macronutrient profiles.

## Core Features

**Automated Menu Collection**: Scrapes daily menus from university sources.
**AI Enrichment**: Uses LLMs to estimate calories, protein, carbs, and fats.
**Nutritional Tracking**: Allows students to log meals and view daily totals.

## Tech Stack

**Framework**: Django
**Database**: PostgreSQL (Normalized)
**Auth**: Google OAuth

## Project Structure

**SmartEats_config**: It is the high-level configuration center for the entire SmartEats platform. It contains the global settings.py and urls.py files required to manage system-wide integrations, such as Google OAuth and the PostgreSQL database.

**mealPlanning**: It is central functionality of the application by enabling students to browse offerings and plan their meals based on nutritional criteria.
