#!/usr/bin/perl
# Prüft die Übersetzungssätze in data/grammatik.json und die Prüfungstexte in
# data/pruefung.json gegen die Originaltexte von
# The Latin Library:
#   1. Wortlaut: „original“ muss als Ganzes vorkommen, „gekürzt“/„angepasst“
#      Teilstück für Teilstück (Längen, j/v, Satzzeichen, Herausgeber-Klammern egal).
#   2. Stellenangabe: Das erste Teilstück muss genau im angegebenen Kapitel/Paragraph
#      stehen (Caesar: Buch,Kapitel,Paragraph – Cicero: Rede,§).
#
# Aufruf: perl tools/verify_quellen.pl .cache/texte
# Texte vorher laden, z. B.: curl -s https://www.thelatinlibrary.com/caesar/gall1.shtml -o .cache/texte/gall1.html
# Neue Autoren/Werke: in %files eintragen (Datei je Buch/Rede).
use strict; use warnings; use utf8; use JSON::PP; use Unicode::Normalize qw(NFD);
binmode STDOUT, ':utf8';
my $T = shift or die "Aufruf: perl tools/verify_quellen.pl ORDNER\n";
my %files = (
  'Caesar|De bello Gallico' => sub { "$T/gall$_[0].html" },   # gall1.html … gall7.html
  'Cicero|In Catilinam'     => sub { "$T/cat$_[0].html" },    # cat1.html … cat4.html (Stelle: Rede,§)
  'Nepos|Themistocles'      => sub { "$T/nepthem1.html" },
  'Nepos|Hannibal'          => sub { "$T/nephan1.html" },
  'Nepos|Atticus'           => sub { "$T/nepatt1.html" },
);

sub norm { my $s = NFD(shift); $s =~ s/\p{Mn}//g; $s = lc $s; $s =~ s/&\w+;/ /g; $s =~ tr/jv/iu/; $s =~ s/[^a-z ]+/ /g; $s =~ s/\s+/ /g; $s =~ s/^ | $//g; return " $s " }

# Text in Abschnitte (Kapitel, Paragraph) zerlegen – wie tools/find_stellen.pl
my %cache;
sub segments {
  my $f = shift;
  return $cache{$f} //= do {
    open my $fh, '<:encoding(latin1)', $f or die "$f: $!";
    my $t = do { local $/; <$fh> };
    $t =~ s/<[^>]+>/ /g; $t =~ s/&nbsp;/ /g; $t =~ s/\s+/ /g;
    my @segs;
    my @ch = split /\[\s*(\d+)\s*\]/, $t;
    for (my $i = 1; $i < @ch; $i += 2) {
      my ($c, $txt) = ($ch[$i], $ch[$i + 1]);
      $txt =~ s/\[[^\]]{1,40}\]/ /g;                         # Herausgeber-Klammern
      my @par = split /\s(\d{1,2})\s(?=[A-Za-z])/, " 0 $txt";
      @par = ('', 0, $txt) if @par < 3;
      for (my $j = 1; $j < @par; $j += 2) { push @segs, [$c, $par[$j], norm($par[$j + 1])] }
    }
    \@segs;
  };
}

# Zu prüfende Stellen sammeln: [Kennung, quelle, bearbeitung, [Teilstücke]]
sub readJson { my $f = shift; open my $j, '<:raw', $f or return; return decode_json(do { local $/; <$j> }) }
my @items;
my $d = readJson('data/grammatik.json');
for my $u (@{ $d->{einheiten} }) {
  for my $a (grep { $_->{typ} eq 'uebersetzung' && $_->{bearbeitung} ne 'konstruiert' } @{ $u->{aufgaben} }) {
    push @items, [$u->{id}, $a->{quelle}, $a->{bearbeitung}, [map { $_->{latein} } @{ $a->{teile} }]];
  }
}
# Prüfungstexte: Auslassungen sind mit „…“ markiert → Teilstücke einzeln suchen;
# Stelle "1,2,1–4" → geprüft wird der Anfang (1,2,1)
if (my $p = readJson('data/pruefung.json')) {
  for my $t (@{ $p->{texte} }) {
    my $q = { %{ $t->{quelle} } };
    $q->{stelle} =~ s/\x{2013}.*//;
    push @items, [$t->{id}, $q, $t->{bearbeitung}, [grep { /\p{L}/ } split /\x{2026}/, $t->{text}]];
  }
}

my $bad = 0;
for my $it (@items) {
  my ($id, $q, $bearb, $teile) = @$it;
  my $mk = $files{"$q->{autor}|$q->{werk}"} or do { print "$id $q->{autor} $q->{stelle}: keine Textdatei hinterlegt\n"; $bad++; next };
  my $noBook = $q->{autor} eq 'Nepos';              # Nepos: nur Kapitel,Paragraph
  my ($book, @rest) = $noBook ? (1, split /,/, $q->{stelle}) : split /,/, $q->{stelle};
  my $segs = segments($mk->($book));
  my $all = join '', map { $_->[2] } @$segs;
  my $allLoose = $all; $allLoose =~ s/\s+/ /g;
  my $whole = index($allLoose, norm(join ' ', @$teile)) >= 0;
  my @miss = grep { index($allLoose, norm($_)) < 0 } @$teile;
  # Stelle des ersten Teilstücks (Satz kann über Paragraphengrenzen gehen → Anfang zählt)
  my $first = norm($teile->[0]);
  my ($where) = grep { index($_->[2], $first) >= 0 } @$segs;
  unless ($where) {   # Teilstück über Paragraphengrenze: Anfang (erste 3 Wörter) suchen
    my @w = grep { length } split / /, $first;
    my $start = ' ' . join(' ', @w[0 .. ($#w < 2 ? $#w : 2)]) . ' ';
    ($where) = grep { index($_->[2], $start) >= 0 } @$segs;
  }
  my $found = !$where ? '?' : $noBook ? "$where->[0],$where->[1]" : @rest == 1 ? "$book,$where->[0]" : "$book,$where->[0],$where->[1]";
  my $stelleOk = $found eq $q->{stelle};
  my $problem = @miss || ($bearb eq 'original' && !$whole) || !$stelleOk;
  $bad++ if $problem;
  printf "%-20s %-9s %-9s %s%s\n", $id, $q->{stelle}, $bearb,
    $whole ? 'Text wörtlich gefunden' : @miss ? 'FEHLT: ' . join(' | ', @miss) : 'Teilstücke wörtlich gefunden',
    $stelleOk ? '' : "  ✗ STELLE: tatsächlich $found";
}
print $bad ? "$bad Probleme\n" : "Alles geprüft – Wortlaut und Stellenangaben stimmen.\n";
