import { useBoard } from '@plait-board/react-board';
import Stack from '../../stack';
import { ToolButton } from '../../tool-button';
import { DuplicateIcon, MenuIcon, RedoIcon, TrashIcon, UndoIcon } from '../../icons';
import classNames from 'classnames';
import {
  ATTACHED_ELEMENT_CLASS_NAME,
  deleteFragment,
  duplicateElements,
  getSelectedElements,
  PlaitBoard,
} from '@plait/core';
import { Island } from '../../island';
import { Popover, PopoverContent, PopoverTrigger } from '../../popover/popover';
import { useState, type ReactNode } from 'react';
import {
  CleanBoard,
  OpenFile,
  SaveAsFile,
  SaveAsImage,
  SaveToFile,
  Socials,
} from './app-menu-items';
import { LanguageSwitcherMenu } from './language-switcher-menu';
import Menu from '../../menu/menu';
import MenuSeparator from '../../menu/menu-separator';
import MenuItem from '../../menu/menu-item';
import { useI18n } from '../../../i18n';

export const AppToolbar = ({ appMenuAction, appMenuAccount, appToolbarContent, showLanguageSwitcher = true, cloudSaveShortcut = false }: {
  appMenuAction?: { label: string; onSelect: () => void };
  appMenuAccount?: { email: string; onLogout: () => void; disabled?: boolean };
  appToolbarContent?: ReactNode;
  showLanguageSwitcher?: boolean;
  cloudSaveShortcut?: boolean;
}) => {
  const board = useBoard();
  const { t } = useI18n();
  const container = PlaitBoard.getBoardContainer(board);
  const selectedElements = getSelectedElements(board);
  const [appMenuOpen, setAppMenuOpen] = useState(false);
  const isUndoDisabled = board.history.undos.length <= 0;
  const isRedoDisabled = board.history.redos.length <= 0;
  return (
    <Island padding={1} className={classNames('app-toolbar', ATTACHED_ELEMENT_CLASS_NAME)}>
      <Stack.Row gap={1}>
        <Popover
          key={0}
          sideOffset={12}
          open={appMenuOpen}
          onOpenChange={(open) => {
            setAppMenuOpen(open);
          }}
          placement="bottom-start"
        >
          <PopoverTrigger asChild>
            <ToolButton
              type="icon"
              visible={true}
              selected={appMenuOpen}
              icon={MenuIcon}
              title={t('general.menu')}
              aria-label={t('general.menu')}
              onPointerDown={() => {
                setAppMenuOpen(!appMenuOpen);
              }}
            />
          </PopoverTrigger>
          <PopoverContent container={container}>
            <Menu
              onSelect={() => {
                setAppMenuOpen(false);
              }}
            >
              {appMenuAccount && <div className="app-menu-account" title={appMenuAccount.email}>{appMenuAccount.email}</div>}
              {appMenuAction && <MenuItem onSelect={appMenuAction.onSelect}>{appMenuAction.label}</MenuItem>}
              {appMenuAccount && <MenuItem onSelect={appMenuAccount.onLogout} disabled={appMenuAccount.disabled}>退出登录</MenuItem>}
              {(appMenuAction || appMenuAccount) && <MenuSeparator />}
              <OpenFile></OpenFile>
              <SaveToFile hideShortcut={cloudSaveShortcut}></SaveToFile>
              <SaveAsFile></SaveAsFile>
              <SaveAsImage></SaveAsImage>
              <CleanBoard></CleanBoard>
              <MenuSeparator />
              {showLanguageSwitcher && <LanguageSwitcherMenu />}
              <Socials />
            </Menu>
          </PopoverContent>
        </Popover>
        {appToolbarContent}
        <ToolButton
          key={1}
          type="icon"
          icon={UndoIcon}
          visible={true}
          title={t('general.undo')}
          aria-label={t('general.undo')}
          onPointerUp={() => {
            board.undo();
          }}
          disabled={isUndoDisabled}
        />
        <ToolButton
          key={2}
          type="icon"
          icon={RedoIcon}
          visible={true}
          title={t('general.redo')}
          aria-label={t('general.redo')}
          onPointerUp={() => {
            board.redo();
          }}
          disabled={isRedoDisabled}
        />
        {selectedElements.length > 0 && (
          <ToolButton
            className="duplicate"
            key={3}
            type="icon"
            icon={DuplicateIcon}
            visible={true}
            title={t('general.duplicate')}
            aria-label={t('general.duplicate')}
            onPointerUp={() => {
              duplicateElements(board);
            }}
          />
        )}
        {selectedElements.length > 0 && (
          <ToolButton
            className="trash"
            key={4}
            type="icon"
            icon={TrashIcon}
            visible={true}
            title={t('general.delete')}
            aria-label={t('general.delete')}
            onPointerUp={() => {
              deleteFragment(board);
            }}
          />
        )}
      </Stack.Row>
    </Island>
  );
};
