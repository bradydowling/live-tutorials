// The module 'vscode' contains the VS Code extensibility API
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

let currentPageNum = 0;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "auto-type" is now active!');

    let disposable = vscode.commands.registerCommand('extension.resetCodeScript', () => {
      currentPageNum = 0;
    });

    context.subscriptions.push(disposable);

    disposable = vscode.commands.registerCommand('extension.completeCodeScript', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      const ws = vscode.workspace;

      if (!vscode.workspace.workspaceFolders) {
        return;
      }

      const rootDir = vscode.workspace.workspaceFolders[0].uri.fsPath;
      const scriptDirName = '.auto-type';
      const scriptDir = path.join(rootDir, scriptDirName);

      let scriptPages;
      try {
        scriptPages = loadScript(scriptDir);
      }
      catch (e) {
        vscode.window.showWarningMessage(e);
        return;
      }

      if (currentPageNum >= scriptPages.length) {
        vscode.window.showInformationMessage('No more script pages.');
        return;
      }

      const scriptPage = scriptPages[currentPageNum];
      currentPageNum += 1;

      const files = scriptPages.map(scriptPage => scriptPage.file );

      const docPromises = files.map(file => {
        const fqfn = (file.indexOf('/') === 0) ? file : path.join(rootDir, file);
        return ws.openTextDocument(fqfn).then(doc => {
          vscode.window.showTextDocument(doc, {preview: false});
        });
      });

      Promise.all(docPromises).then(() => {
        const docs = ws.textDocuments;
        const changeDoc = docs.find(doc => doc.fileName.indexOf(scriptPage.file) > -1);

        if (!changeDoc) {
          return;
        }

        vscode.window.showTextDocument(changeDoc).then(() => {
            const range = changeDoc.lineAt(scriptPage.line).range;
            if (vscode.window.activeTextEditor) {
              vscode.window.activeTextEditor.selection = new vscode.Selection(range.start, range.end);
              vscode.window.activeTextEditor.revealRange(range, scriptPage.align);
            }

            const pos = new vscode.Position(scriptPage.line, scriptPage.col);
            const changeText = typeof(scriptPage.content) === 'string' ? scriptPage.content : scriptPage.content.join('');
            type(changeText, pos);
          });
      });
    });

    context.subscriptions.push(disposable);

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    disposable = vscode.commands.registerCommand('extension.playCodeScript', () => {
      // The code you place here will be executed every time your command is executed

      let editor = vscode.window.activeTextEditor;
      if (!editor) {return;}

      let ws = vscode.workspace;

      if (!vscode.workspace.workspaceFolders) {
        return;
      }

      const rootDir = vscode.workspace.workspaceFolders[0].uri.fsPath;
      const scriptDirName = '.auto-type';
      const scriptDir = path.join(rootDir, scriptDirName);

      let scriptPages;
      try {
        scriptPages = loadScript(scriptDir);
      }
      catch (e) {
        vscode.window.showWarningMessage(e);
        return;
      }

      if (currentPageNum >= scriptPages.length) {
        vscode.window.showInformationMessage('No more script pages.');
        return;
      }

      let scriptPage = scriptPages[currentPageNum];
      currentPageNum += 1;

      let files = scriptPages.map(scriptPage => scriptPage.file );

      let docPromises = files.map(file => {
        let fqfn = (file.indexOf('/') === 0) ? file : path.join(rootDir, file);
        return ws.openTextDocument(fqfn).
                  then(doc => {
                    vscode.window.showTextDocument(doc, {preview: false});
                  });
      });

      Promise.all(docPromises).then(() => {
        const docs = ws.textDocuments;
        const changeDoc = docs.find(doc => doc.fileName.indexOf(scriptPage.file) > -1);

        if (!changeDoc) {
          return;
        }

        vscode.window.showTextDocument(changeDoc).then(() => {
            const range = changeDoc.lineAt(scriptPage.line).range;
            if (vscode.window.activeTextEditor) {
              vscode.window.activeTextEditor.selection =  new vscode.Selection(range.start, range.end);
              vscode.window.activeTextEditor.revealRange(range, scriptPage.align);
            }

            const pos = new vscode.Position(scriptPage.line, scriptPage.col);
            const changeText = typeof(scriptPage.content) === 'string' ? scriptPage.content : scriptPage.content.join('');
            type(changeText, pos);
          });
      });
    });

    context.subscriptions.push(disposable);
}

interface ScriptPage extends FrontMatter {
  name: string;
  path: string;
  content: string | string[];
}

function loadScript(scriptDir: string): ScriptPage[] {
  if (!fs.existsSync(scriptDir)) {
    vscode.window.showWarningMessage(`The script directory ${scriptDir} does not exist. Nothing for auto-type to do.`);
    return [];
  }
  const pages = fs.readdirSync(scriptDir);
  if (!pages.length) {
    vscode.window.showWarningMessage(`No script pages found in ${scriptDir}. Nothing for auto-type to do.`);
    return [];
  }
  return pages.map(pageName => {
    return parseScriptPage(pageName, scriptDir);
  });
}

function parseScriptPage(pageName: string, scriptDir: string): ScriptPage {
  const pagePath = path.join(scriptDir, pageName);
  const fullContent = fs.readFileSync(pagePath, {encoding: 'utf-8'});
  const parts = fullContent.split(/\n\-\-\-\n/m);

  let frontMatter, content;
  try {
    frontMatter = parseFrontMatter(parts[0]);
    content = parts[1];
  }
  catch (e) {
    throw new Error(`${e} in script page ${pagePath}`);
  }

  const options = {
    file: frontMatter.file,
    name: pageName,
    path: pagePath,
    content: content,
    line: frontMatter.line,
    col: frontMatter.col,
    align: frontMatter.align,
  };

  if (!options.file) {
    throw new Error("Missing file property");
  }
  if (!fs.existsSync(options.file) && !fs.existsSync(scriptDir + '/../' + options.file)) {
    throw new Error(`Can't find target file  ${options.file}`);
  }

  return options;
}

interface FrontMatter {
  file: string;
  line: number;
  col: number;
  align: vscode.TextEditorRevealType | undefined;
}

function parseFrontMatter(text: string): FrontMatter {
  const rawOptions = text.split("\n").reduce((accumulator, line) => {
    const [lineKey, lineVal] = line.split(/\s*:\s*/);
    return {
      [lineKey]: lineVal,
      ...accumulator,
    };
  }, {} as {
    [key: string]: string;
  });

  // Either parse the provided line or use 1, then 0-index it
  const line = (rawOptions.line ? parseInt(rawOptions.line, 10) : 1) - 1;
  const col = (rawOptions.col ? parseInt(rawOptions.col, 10) : 1) - 1;
  
  // See https://code.visualstudio.com/api/references/vscode-api#TextEditorRevealType
  const align = rawOptions.align || 'middle';
  const newAlign = align === 'middle' ? 2 : 3;

  return {
    file: rawOptions.file,
    line,
    col,
    align: newAlign
  };
}

async function timedCharacterType(text: string, pos: vscode.Position, delay: number) {
  const editor = vscode.window.activeTextEditor;
  
  if (!editor || !text || text.length === 0) {return;}

  let _pos = pos;
  let char = text.substring(0, 1);
  // TODO: Create function for typing a letter, call sound play in there
  // use this for reference https://github.com/jengjeng/aural-coding-vscode/blob/0b9a49881f8908aae1ccec689b2238b0aaf367a1/src/lib/player.ts
  /*
  const triggerKey = () => {
    const config = vscode.workspace.getConfiguration('auto-coder');
    if (!config || !config.get('soundEffects')) {

    }
  }
  */
  if (char === '↓') {
    _pos = new vscode.Position(pos.line + 1, pos.character);
    char = '';
  }
  if (char === '↑') {
    _pos = new vscode.Position(pos.line - 1, pos.character);
    char = '';
  }
  if (char === '→') {
    _pos = new vscode.Position(pos.line, pos.character + 1);
    char = '';
  }
  if (char === '←') {
    _pos = new vscode.Position(pos.line, pos.character - 1);
    char = '';
  }
  if (char === '⇤') {
    _pos = new vscode.Position(pos.line, 0);
    char = '';
  }
  if (char === '⇥') {
    _pos = editor.document.lineAt(pos.line).range.end;
    char = '';
  }

  await editor.edit(editBuilder => {
    if (char !== '⌫') {
      editBuilder.insert(_pos, char);
    }
    else {
      _pos = new vscode.Position(pos.line, pos.character - 1);
      let selection = new vscode.Selection(_pos, pos);
      editBuilder.delete(selection);
      char = '';
    }

    let newSelection = new vscode.Selection(_pos, _pos);
    if (char === "\n") {
      newSelection = new vscode.Selection(pos, pos);
      _pos = new vscode.Position(pos.line + 1, 0);
      char = '';
    }

    editor.selection = newSelection;
  });
  // TODO: Allow user specified delays here for base, and variation
  const baseDelay = 20;
  const variableDelay = 80;
  await pause(baseDelay + (variableDelay * Math.random()));
  return { };
}

function pause(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function type(text: string, currentPosition: vscode.Position) {
  const editor = vscode.window.activeTextEditor;
  
  if (!editor || !text || text.length === 0) {return;}

  let newPosition = currentPosition;
  let char = text.substring(0, 1);
  // TODO: Create function for typing a letter, call sound play in there
  // use this for reference https://github.com/jengjeng/aural-coding-vscode/blob/0b9a49881f8908aae1ccec689b2238b0aaf367a1/src/lib/player.ts
  /*
  const triggerKey = () => {
    const config = vscode.workspace.getConfiguration('auto-coder');
    if (!config || !config.get('soundEffects')) {

    }
  }
  */
  if (char === '↓') {
    newPosition = new vscode.Position(currentPosition.line + 1, currentPosition.character);
    char = '';
  }
  if (char === '↑') {
    newPosition = new vscode.Position(currentPosition.line - 1, currentPosition.character);
    char = '';
  }
  if (char === '→') {
    newPosition = new vscode.Position(currentPosition.line, currentPosition.character + 1);
    char = '';
  }
  if (char === '←') {
    newPosition = new vscode.Position(currentPosition.line, currentPosition.character - 1);
    char = '';
  }
  if (char === '⇤') {
    newPosition = new vscode.Position(currentPosition.line, 0);
    char = '';
  }
  if (char === '⇥') {
    newPosition = editor.document.lineAt(currentPosition.line).range.end;
    char = '';
  }

  editor.edit(editBuilder => {
    if (char !== '⌫') {
      editBuilder.insert(newPosition, char);
    }
    else {
      newPosition = new vscode.Position(currentPosition.line, currentPosition.character - 1);
      let selection = new vscode.Selection(newPosition, currentPosition);
      editBuilder.delete(selection);
      char = '';
    }

    let newSelection = new vscode.Selection(newPosition, newPosition);
    if (char === "\n") {
      newSelection = new vscode.Selection(currentPosition, currentPosition);
      newPosition = new vscode.Position(currentPosition.line + 1, 0);
      char = '';
    }

    editor.selection = newSelection;
  }).then(() => {
    const config = vscode.workspace.getConfiguration('autoCoder');
    const baseDelay = config.get('baseCharacterDelay', 20);
    const variableDelay = config.get('baseCharacterDelay', 80);
    const delay = baseDelay + variableDelay * Math.random();
    const _p = new vscode.Position(newPosition.line, char.length + newPosition.character);
    // TODO: Rewrite this using async/await, no recursive setTimeouts
    setTimeout(() => {
      type(text.substring(1, text.length), _p);
    }, delay);
  });
}

// this method is called when your extension is deactivated
export function deactivate() {
}
