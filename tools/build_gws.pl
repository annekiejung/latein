#!/usr/bin/perl
# Baut aus data-src/gws_dcc.txt (Etappe 1+2) und data-src/gws_claude.txt (Etappe 3)
# die Datei data/grundwortschatz.json, die die App lädt.
#
#   - prüft auf Dopplungen (gleiche Grundform ohne Längen + gleiche Wortart)
#     → bricht mit Liste ab, damit keine Vokabel doppelt vorkommt
#   - meldet gleiche Grundform mit anderer Wortart (z. B. cum Präp./Subj.) nur als Hinweis
#   - übernimmt den Prüfstatus aus data-src/abgleich-*.tsv (tools/gws_check.pl)
#   - vergibt laufende Nummer, Etappe (1: 1–500, 2: bis Ende Dickinson, 3: Rest)
#     und Paket (100er-Blöcke)
#
# Aufruf: perl tools/build_gws.pl
use strict;
use warnings;
use utf8;
use JSON::PP;
use Unicode::Normalize qw(NFD NFC);
binmode STDOUT, ':utf8';

my $root = do { my $d = __FILE__; $d =~ s{/tools/[^/]+$}{}; $d eq __FILE__ ? '.' : $d };

sub plain { my $s = NFD(shift); $s =~ s/\p{Mn}//g; $s = NFC($s); $s =~ s/^-//; return lc $s }

# Prüfstatus je Quelle und Zeilennummer
my %status;
for my $base (qw(gws_dcc gws_claude)) {
  my $f = "$root/data-src/abgleich-$base.tsv";
  open my $fh, '<:utf8', $f or next;
  <$fh>;
  while (<$fh>) { chomp; my ($nr, $lat, $st) = split /\t/; $status{"$base:$nr"} = $st; }
}

# Prüfstatus → Anzeige in der App
sub pruef {
  my $s = shift // '';
  return 'wiktionary' if $s =~ /^wiktionary-/;
  return 'georges'    if $s =~ /^georges-(ok|teilweise)/;
  return 'geprueft'   if $s =~ /^geprueft-gleich/;
  return 'vorlage'    if $s =~ /^geprueft-vorlage/;
  return 'ungeprueft';                       # unbelegt / abweichend / noch nicht geprüft
}

my (@out, %seen, %byLatin, @dups);
for my $base (qw(gws_dcc gws_claude)) {
  open my $fh, '<:utf8', "$root/data-src/$base.txt" or die "$base: $!";
  while (<$fh>) {
    chomp;
    next if /^\s*(#|$)/;
    my ($nr, $lat, $wa, $formen, $bed, $hinw) = split /\|/, $_, -1;
    die "Zeile unvollständig in $base: $_\n" unless defined $bed && length $lat;
    # Dopplung = gleiche Grundform (ohne Längen) + gleiche Wortart + gleiche zweite Form.
    # So bleiben ōs, ōris (Mund) und os, ossis (Knochen) oder pārēre/parere getrennt.
    my ($second) = split /[ ,]/, ($formen // '');
    my $key = plain($lat) . '|' . $wa . '|' . plain($second // '');
    if ($seen{$key}) { push @dups, "$lat ($wa): $seen{$key} und $base:$nr"; next; }
    $seen{$key} = "$base:$nr";
    push @{ $byLatin{plain($lat)} }, "$wa ($base:$nr)";

    my %e = (latein => $lat, wortart => $wa, bedeutungen => [ map { s/^\s+|\s+$//gr } split /;/, $bed ]);
    $formen //= '';
    if ($wa eq 'nomen') {
      my @p = split ' ', $formen;
      if (@p == 1) { $e{genus} = $p[0] } elsif (@p >= 2) { $e{genus} = pop @p; $e{genitiv} = join ' ', @p }
    } elsif ($wa eq 'verb') {
      $e{stammformen} = [ grep { length } map { s/^\s+|\s+$//gr } split /,/, $formen ] if length $formen;
    } elsif ($wa eq 'praeposition') {
      $e{kasus} = $formen if length $formen;
    } else {
      $e{formen} = $formen if length $formen;
    }
    $e{hinweis} = $hinw if defined $hinw && length $hinw;
    $e{quelle} = $base eq 'gws_dcc' ? 'dcc' : 'claude';
    $e{rang} = $nr + 0 if $base eq 'gws_dcc';
    $e{pruefung} = pruef($status{"$base:$nr"});
    # Stabile ID (Lernstand hängt daran): Grundform MIT Längen, damit ōs und os verschieden sind
    my $slug = lc NFD($lat); $slug =~ s/\x{0304}/_/g; $slug =~ s/\p{Mn}//g; $slug =~ s/[^a-z_]+/-/g;
    $e{id} = 'g-' . $slug . '-' . substr($wa, 0, 3);
    push @out, \%e;
  }
}

if (@dups) {
  print "DOPPELT (bitte in data-src beheben):\n", map { "  $_\n" } @dups;
  exit 1;
}

my $dccCount = grep { $_->{quelle} eq 'dcc' } @out;
# Pakete à 100 Wörter, an jeder Etappengrenze beginnt ein neues Paket
my ($i, $paket, $inPaket, $prevEtappe) = (0, 0, 100, 0);
for my $e (@out) {
  $i++;
  $e->{nr} = $i;
  $e->{etappe} = $i <= 500 ? 1 : $i <= $dccCount ? 2 : 3;
  if ($e->{etappe} != $prevEtappe || $inPaket == 100) { $paket++; $inPaket = 0; }
  $inPaket++;
  $prevEtappe = $e->{etappe};
  $e->{paket} = $paket;
}

my @homographs = grep { @{ $byLatin{$_} } > 1 } sort keys %byLatin;
print "Hinweis – gleiche Grundform, andere Wortart (kein Fehler): ",
  join('; ', map { "$_ = " . join(' / ', @{ $byLatin{$_} }) } @homographs), "\n" if @homographs;

my %stat; $stat{ $_->{pruefung} }++ for @out;
my %et;   $et{ $_->{etappe} }++ for @out;

my $data = {
  format => 'latein-grundwortschatz',
  version => 1,
  stand => do { my @t = localtime; sprintf '%04d-%02d-%02d', $t[5] + 1900, $t[4] + 1, $t[3] },
  quellen => {
    dcc => 'Dickinson College Commentaries, Latin Core Vocabulary (C. Francese; Daten: LASLA), CC BY-SA – Wortauswahl, Reihenfolge, Wortart',
    claude => 'von Claude (KI) zusammengestellt bzw. ergänzt – alle deutschen Bedeutungen; Etappe 3 komplett',
    abgleich => 'Wiktionary (de, CC BY-SA) und K. E. Georges, Ausführliches lateinisch-deutsches Handwörterbuch (1913, gemeinfrei, via zeno.org)',
  },
  lizenz => 'CC BY-SA 4.0',
  eintraege => \@out,
};
my $json = JSON::PP->new->utf8->canonical->encode($data);
open my $o, '>:raw', "$root/data/grundwortschatz.json" or die "data/grundwortschatz.json: $!";
print $o $json;
close $o;

printf "Gebaut: %d Wörter (Etappe 1: %d, 2: %d, 3: %d), %.0f KB\n",
  scalar @out, $et{1} // 0, $et{2} // 0, $et{3} // 0, length($json) / 1024;
print "Prüfstatus: ", join(', ', map { "$_ $stat{$_}" } sort keys %stat), "\n";
