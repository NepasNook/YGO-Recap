-- Typo fix: the EDISON deck is named after Blackwing - Vayu the Emblem of Honor.
UPDATE public.decks
SET name = 'Vayu Turbo'
WHERE name = 'Vaju Turbo' AND game_format = 'edison';