"""add jit content: tags, jit_tips, and their join tables

Revision ID: b2e4a1c9d503
Revises: a3f7c2d9b481
Create Date: 2026-07-28 00:00:00.000000

Platform-wide (not org-scoped) content library for the teen exposure screen's
"how to handle it" tips. Tips surface when their tags overlap the situation's
tags, plus any tip flagged always_show. Seeds a starter tag vocabulary and
placeholder tips (universal ones as always_show, a few tagged ones) — all
placeholder copy for Dr. Walker to replace via the admin portal.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b2e4a1c9d503'
down_revision: Union[str, None] = 'a3f7c2d9b481'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'tags',
        sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('slug', sa.String(), nullable=False),
        sa.Column('label', sa.String(), nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('slug'),
    )
    op.create_table(
        'jit_tips',
        sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('always_show', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.Column('display_order', sa.Integer(), server_default=sa.text('0'), nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table(
        'jit_tip_tags',
        sa.Column('jit_tip_id', sa.Uuid(), nullable=False),
        sa.Column('tag_id', sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(['jit_tip_id'], ['jit_tips.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['tag_id'], ['tags.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('jit_tip_id', 'tag_id'),
    )
    op.create_table(
        'trigger_situation_tags',
        sa.Column('trigger_situation_id', sa.Uuid(), nullable=False),
        sa.Column('tag_id', sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(['trigger_situation_id'], ['trigger_situations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['tag_id'], ['tags.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('trigger_situation_id', 'tag_id'),
    )

    # ── Seed: starter tag vocabulary (admin-editable) ──
    op.execute(
        """
        INSERT INTO tags (slug, label) VALUES
          ('social', 'Social'),
          ('separation', 'Separation'),
          ('contamination', 'Contamination'),
          ('health-illness', 'Health / illness'),
          ('harm-safety', 'Harm / safety'),
          ('performance-school', 'Performance / school'),
          ('uncertainty', 'Uncertainty'),
          ('physical-sensations', 'Physical sensations'),
          ('specific-phobia', 'Specific phobia'),
          ('perfectionism', 'Perfectionism')
        """
    )

    # ── Seed: placeholder tips (PLACEHOLDER copy — replace via admin) ──
    # Universal tips: shown on every exposure.
    op.execute(
        """
        INSERT INTO jit_tips (title, body, always_show, display_order) VALUES
          ('The goal isn''t to feel calm',
           'It''s to find out what actually happens when you don''t avoid it.', true, 1),
          ('Anxiety comes down on its own',
           'It rises, peaks, then fades — you don''t have to make it stop.', true, 2),
          ('Skip the safety moves',
           'Let yourself be in it without the little things you''d do to feel safer.', true, 3)
        """
    )
    # Contextual placeholders: shown when the situation carries the matching tag.
    op.execute(
        """
        INSERT INTO jit_tips (title, body, always_show, display_order) VALUES
          ('People notice less than you think',
           'Most people are focused on themselves, not watching you.', false, 4),
          ('You can handle being apart',
           'The worry usually fades once the moment actually starts.', false, 5),
          ('You don''t need to be sure',
           'You can be okay without being 100% certain it''s clean.', false, 6)
        """
    )
    # Tag the contextual placeholders.
    op.execute(
        """
        INSERT INTO jit_tip_tags (jit_tip_id, tag_id)
        SELECT jt.id, t.id FROM jit_tips jt, tags t
        WHERE (jt.title = 'People notice less than you think' AND t.slug = 'social')
           OR (jt.title = 'You can handle being apart' AND t.slug = 'separation')
           OR (jt.title = 'You don''t need to be sure' AND t.slug = 'contamination')
        """
    )


def downgrade() -> None:
    op.drop_table('trigger_situation_tags')
    op.drop_table('jit_tip_tags')
    op.drop_table('jit_tips')
    op.drop_table('tags')
