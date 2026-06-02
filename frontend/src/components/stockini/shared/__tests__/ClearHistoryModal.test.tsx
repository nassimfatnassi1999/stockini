import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ClearHistoryModal } from '../ClearHistoryModal';

describe('ClearHistoryModal', () => {
  const defaultProps = {
    open: true,
    onClose: jest.fn(),
    onConfirm: jest.fn(),
    isPending: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('ne rend rien si open=false', () => {
    render(<ClearHistoryModal {...defaultProps} open={false} />);
    expect(screen.queryByText(/Vider l'historique/i)).not.toBeInTheDocument();
  });

  it('affiche le modal quand open=true', () => {
    render(<ClearHistoryModal {...defaultProps} />);
    expect(screen.getByText(/Vider l'historique/i)).toBeInTheDocument();
  });

  it('affiche le champ obligatoire à taper VIDER', () => {
    render(<ClearHistoryModal {...defaultProps} />);
    expect(screen.getByPlaceholderText('VIDER')).toBeInTheDocument();
  });

  it('bouton Confirmer désactivé si champ vide', () => {
    render(<ClearHistoryModal {...defaultProps} />);
    const confirmBtn = screen.getByRole('button', { name: /Confirmer/i });
    expect(confirmBtn).toBeDisabled();
  });

  it('bouton Confirmer désactivé si texte incorrect', () => {
    render(<ClearHistoryModal {...defaultProps} />);
    const input = screen.getByPlaceholderText('VIDER');
    fireEvent.change(input, { target: { value: 'VIDE' } });
    const confirmBtn = screen.getByRole('button', { name: /Confirmer/i });
    expect(confirmBtn).toBeDisabled();
  });

  it('bouton Confirmer actif si VIDER est tapé exactement', () => {
    render(<ClearHistoryModal {...defaultProps} />);
    const input = screen.getByPlaceholderText('VIDER');
    fireEvent.change(input, { target: { value: 'VIDER' } });
    const confirmBtn = screen.getByRole('button', { name: /Confirmer/i });
    expect(confirmBtn).not.toBeDisabled();
  });

  it('appelle onConfirm quand VIDER tapé et bouton cliqué', () => {
    render(<ClearHistoryModal {...defaultProps} />);
    const input = screen.getByPlaceholderText('VIDER');
    fireEvent.change(input, { target: { value: 'VIDER' } });
    fireEvent.click(screen.getByRole('button', { name: /Confirmer/i }));
    expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('appelle onClose au clic sur Annuler', () => {
    render(<ClearHistoryModal {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Annuler/i }));
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('bouton Confirmer désactivé quand isPending=true', () => {
    render(<ClearHistoryModal {...defaultProps} isPending={true} />);
    const input = screen.getByPlaceholderText('VIDER');
    fireEvent.change(input, { target: { value: 'VIDER' } });
    const confirmBtn = screen.getByRole('button', { name: /Vidage/i });
    expect(confirmBtn).toBeDisabled();
  });

  it('affiche le nom du module dans le titre si fourni', () => {
    render(<ClearHistoryModal {...defaultProps} moduleName="Paiements clients" />);
    expect(screen.getByText(/Paiements clients/i)).toBeInTheDocument();
  });

  it("convertit la saisie en majuscules automatiquement", () => {
    render(<ClearHistoryModal {...defaultProps} />);
    const input = screen.getByPlaceholderText('VIDER') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'vider' } });
    expect(input.value).toBe('VIDER');
  });
});
