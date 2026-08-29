"""review rounds

A reviewer marks generated suggestions from an unguessable link, with no login. Built for Dr.
Walker reviewing exposure-ladder suggestions; reusable for the extraction and arrow work.

These tables hold their own copy of the text and reference no patient rows, so a forwarded link
reaches the review items and nothing else.

Not destructive: three new tables, nothing altered or dropped.

Plan: docs/plans/ladder-generation.md

Revision ID: e5b93c27a114
Revises: c3f81a7d64b2
Create Date: 2026-08-28

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'e5b93c27a114'
down_revision = 'c3f81a7d64b2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'review_rounds',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('slug', sa.String(), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('instructions', sa.Text(), nullable=True),
        sa.Column('items', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('slug'),
    )
    op.create_table(
        'review_reviewers',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('round_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('token', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['round_id'], ['review_rounds.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('token'),
    )
    op.create_table(
        'review_marks',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('reviewer_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('item_key', sa.String(), nullable=False),
        sa.Column('choice', sa.String(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['reviewer_id'], ['review_reviewers.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('uq_review_marks_item', 'review_marks', ['reviewer_id', 'item_key'], unique=True)


def downgrade() -> None:
    op.drop_index('uq_review_marks_item', table_name='review_marks')
    op.drop_table('review_marks')
    op.drop_table('review_reviewers')
    op.drop_table('review_rounds')
