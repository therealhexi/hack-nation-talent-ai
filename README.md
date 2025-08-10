# hack-nation-talent-ai
I am building a hackathon project for the following challenge. Reference: https://docs.google.com/document/d/1tZjCtKZilgFHp9sDxf7qoQE9BTVBcX7OTCfgk03AkTk/edit?tab=t.0

## Problem
 Some tech companies have been paying eye-watering signing bonuses to lure the top AI engineers and researchers — the kind of figures that make even seasoned VCs choke on their oat milk lattes. Yet despite the money flying around, hiring AI talent is still painfully slow. As Cluley would say, the whole thing has been “outsmarted by AI” anyway. We believe the hiring process is broken — and we want you to rebuild it from the ground up with AI. Find the right match between candidates and roles faster than human recruiters can refresh LinkedIn. Validate skills in a way that’s fair, scalable, and bias-aware — without boring candidates to death.

## Requirements
I want to build a system that can match job candidate with job posting. Here are a few key architectural primitives:
1. Job Candidate: I want job candidate to connect their github so I can traverse through their github repos. The github repos are going to be the key data for understanding a candidate's experience. 
2. Skillet: Each job candidate will possess a list of skillsets, derived from their codebase and recent coding history. We want to fucus on building the skillset using their recent code commits, rather than an arbitrary CV. 
3. Job Posting: I want a cron job to routinely crawl job postings, store in the internal database, and index so we can run matching against the database.
4. Matching: I want a simple matching algorithms (similarity based search) that best match skillsets and show employers

## Personas
1. Candidate: Candidates can connect to their github and trigger workflows that derive their skillsets based on their authorized code history. Candidates can also click a "Match" button to match their profile against the latest job posting. 
2. Employer: Employer can open their job posting, and trigger workflows that matches the github user profiles which best fit their job posting. 

## Job Postings
Job posting will be crawled from https://foorilla.com/hiring/ periodically, and stored in an internal database. Right now, the crawler will happen outside of this app, and data will be ready for loading. 

## Tenant
1. Be as simple as possible. Do not add anything unless absolutely necessary.
2. Use as few dependency and services as possible. 
3. The design doesn't need to be scalable or extensible.